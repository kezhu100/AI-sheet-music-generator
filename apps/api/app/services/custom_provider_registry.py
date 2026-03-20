from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
from typing import Dict, Optional
from urllib.parse import unquote, urlparse

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.core.config import Settings, get_settings
from app.models.schemas import (
    CustomProviderInstallSourceType,
    ProviderCategory,
    ProviderLayer,
    RuntimeCustomProvider,
)
from app.services.provider_manifest import build_manifest_index


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


_PROVIDER_ID_PATTERN = re.compile(r"^custom-[a-z0-9]+(?:[-_][a-z0-9]+)*$")
_SAFE_ASSET_NAME_PATTERN = re.compile(r"[^a-zA-Z0-9._-]+")


@dataclass(frozen=True)
class CustomProviderValidationFailure:
    reason: str
    message: str
    actionable_steps: tuple[str, ...]


class CustomProviderAssetManifest(BaseModel):
    name: str
    url: str
    sha256: str

    model_config = {"extra": "forbid"}

    @field_validator("name", "url", "sha256")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Manifest asset fields must not be empty.")
        return trimmed


class CustomProviderManifest(BaseModel):
    schema_version: int = Field(alias="schemaVersion")
    provider_id: str = Field(alias="providerId")
    display_name: str = Field(alias="displayName")
    provider_version: str = Field(alias="providerVersion")
    category: ProviderCategory
    description: Optional[str] = None
    runtime_module: Optional[str] = Field(default=None, alias="runtimeModule")
    assets: list[CustomProviderAssetManifest] = Field(default_factory=list)

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("schema_version")
    @classmethod
    def validate_schema_version(cls, value: int) -> int:
        if value != 1:
            raise ValueError("Only custom provider manifest schemaVersion=1 is supported.")
        return value

    @field_validator("provider_id")
    @classmethod
    def validate_provider_id(cls, value: str) -> str:
        trimmed = value.strip()
        if not _PROVIDER_ID_PATTERN.fullmatch(trimmed):
            raise ValueError("providerId must use the explicit custom-* id format.")
        return trimmed

    @field_validator("display_name", "provider_version")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Manifest text fields must not be empty.")
        return trimmed


class CustomProviderRegistryRecord(BaseModel):
    provider_id: str = Field(alias="providerId")
    category: ProviderCategory
    display_name: str = Field(alias="displayName")
    provider_layer: ProviderLayer = Field(alias="providerLayer")
    source_type: CustomProviderInstallSourceType = Field(alias="sourceType")
    source_transport: str = Field(alias="sourceTransport")
    provider_version: str = Field(alias="providerVersion")
    manifest_url: str = Field(alias="manifestUrl")
    manifest_path: str = Field(alias="manifestPath")
    runtime_module: Optional[str] = Field(default=None, alias="runtimeModule")
    asset_count: int = Field(alias="assetCount")
    installed_at: datetime = Field(alias="installedAt")
    updated_at: datetime = Field(alias="updatedAt")
    detail: str

    model_config = {"populate_by_name": True, "extra": "forbid"}

    def to_runtime_model(self) -> RuntimeCustomProvider:
        status_text = "Custom provider manifest is registered in app-managed local storage."
        return RuntimeCustomProvider(
            providerId=self.provider_id,
            category=self.category,
            displayName=self.display_name,
            providerLayer=self.provider_layer,
            sourceType=self.source_type,
            sourceTransport="file",
            providerVersion=self.provider_version,
            manifestUrl=self.manifest_url,
            manifestPath=self.manifest_path,
            installed=True,
            available=False,
            assetCount=self.asset_count,
            statusText=status_text,
            detail=self.detail,
        )


class CustomProviderRegistryService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings
        self._records: Dict[str, CustomProviderRegistryRecord] = {}
        self._load_records()

    def list_runtime_models(self, category: ProviderCategory) -> list[RuntimeCustomProvider]:
        return [record.to_runtime_model() for record in self._records.values() if record.category == category]

    def validate_manifest_url(self, manifest_url: str) -> tuple[Optional[CustomProviderManifest], Optional[CustomProviderValidationFailure]]:
        try:
            manifest_path = self._manifest_path_from_url(manifest_url)
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest = CustomProviderManifest.model_validate(payload)
        except CustomProviderValidationError as exc:
            return None, exc.failure
        except OSError as exc:
            return None, CustomProviderValidationFailure(
                reason="manifest_read_failed",
                message=f"Could not read the custom provider manifest: {exc}",
                actionable_steps=(
                    "Verify that the file:// manifest URL points to a readable local JSON file.",
                ),
            )
        except json.JSONDecodeError as exc:
            return None, CustomProviderValidationFailure(
                reason="manifest_invalid_json",
                message=f"Custom provider manifest is not valid JSON: {exc}",
                actionable_steps=(
                    "Fix the local manifest JSON and retry the custom install request.",
                ),
            )
        except ValidationError as exc:
            return None, CustomProviderValidationFailure(
                reason="manifest_validation_failed",
                message=f"Custom provider manifest validation failed: {exc.errors()[0]['msg']}",
                actionable_steps=(
                    "Update the local manifest to match the supported schemaVersion=1 contract.",
                ),
            )

        if manifest.provider_id in {provider_id for _, provider_id in build_manifest_index().keys()}:
            return None, CustomProviderValidationFailure(
                reason="provider_id_reserved",
                message=f"Custom provider id '{manifest.provider_id}' is reserved by the built-in or official enhanced provider set.",
                actionable_steps=(
                    "Use a distinct custom-* providerId that does not collide with the fixed official provider set.",
                ),
            )

        for asset in manifest.assets:
            asset_failure = self._validate_asset_url(asset.url)
            if asset_failure is not None:
                return None, asset_failure

        return manifest, None

    def install_from_manifest_url(
        self,
        manifest_url: str,
        *,
        force_reinstall: bool = False,
    ) -> tuple[CustomProviderRegistryRecord, str]:
        manifest, failure = self.validate_manifest_url(manifest_url)
        if manifest is None:
            raise CustomProviderValidationError(failure or CustomProviderValidationFailure(
                reason="manifest_validation_failed",
                message="Custom provider manifest validation failed.",
                actionable_steps=("Retry with a supported file:// manifest URL.",),
            ))

        existing = self._records.get(manifest.provider_id)
        if existing is not None and not force_reinstall:
            return existing, f"Custom provider {manifest.display_name} is already registered."

        settings = self._settings or get_settings()
        provider_dir = settings.custom_provider_registry_dir / manifest.provider_id
        assets_dir = provider_dir / "assets"
        provider_dir.mkdir(parents=True, exist_ok=True)
        assets_dir.mkdir(parents=True, exist_ok=True)

        manifest_path = self._manifest_path_from_url(manifest_url)
        stored_manifest_path = provider_dir / "manifest.json"
        shutil.copyfile(manifest_path, stored_manifest_path)

        copied_assets = []
        for asset in manifest.assets:
            source_path = self._local_path_from_file_url(asset.url)
            target_name = self._safe_asset_name(asset.name, source_path.suffix)
            target_path = assets_dir / target_name
            shutil.copyfile(source_path, target_path)
            actual_sha = self._sha256_file(target_path)
            if actual_sha != asset.sha256.lower():
                raise CustomProviderValidationError(
                    CustomProviderValidationFailure(
                        reason="asset_checksum_mismatch",
                        message=f"Custom provider asset '{asset.name}' failed sha256 validation.",
                        actionable_steps=(
                            "Replace the local asset with the expected file and retry the custom install request.",
                        ),
                    )
                )
            copied_assets.append(target_path)

        now = _utc_now()
        record = CustomProviderRegistryRecord(
            providerId=manifest.provider_id,
            category=manifest.category,
            displayName=manifest.display_name,
            providerLayer="custom",
            sourceType="manifest_url",
            sourceTransport="file",
            providerVersion=manifest.provider_version,
            manifestUrl=manifest_url,
            manifestPath=str(stored_manifest_path),
            runtimeModule=manifest.runtime_module,
            assetCount=len(copied_assets),
            installedAt=existing.installed_at if existing is not None else now,
            updatedAt=now,
            detail=(
                "Registered from a local file:// manifest into app-managed storage. "
                "Custom providers are surfaced in diagnostics only in this step and are not wired into the main Auto pipeline."
            ),
        )
        self._records[record.provider_id] = record
        self._persist_records()
        return record, f"Custom provider {manifest.display_name} was registered from the local manifest."

    def _load_records(self) -> None:
        settings = self._settings or get_settings()
        registry_file = settings.custom_provider_registry_file
        if not registry_file.exists():
            return
        try:
            payload = json.loads(registry_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if not isinstance(payload, list):
            return
        loaded: Dict[str, CustomProviderRegistryRecord] = {}
        for item in payload:
            try:
                record = CustomProviderRegistryRecord.model_validate(item)
            except ValidationError:
                continue
            loaded[record.provider_id] = record
        self._records = loaded

    def _persist_records(self) -> None:
        settings = self._settings or get_settings()
        settings.custom_provider_registry_dir.mkdir(parents=True, exist_ok=True)
        serialized = [record.model_dump(mode="json", by_alias=True) for record in self._records.values()]
        settings.custom_provider_registry_file.write_text(
            json.dumps(serialized, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    def _manifest_path_from_url(self, manifest_url: str) -> Path:
        parsed = urlparse(manifest_url)
        if parsed.scheme != "file":
            raise CustomProviderValidationError(
                CustomProviderValidationFailure(
                    reason="unsupported_source",
                    message="Only file:// manifest URLs are supported for custom providers in this step.",
                    actionable_steps=(
                        "Create a local manifest JSON file and retry with a file:// URL.",
                    ),
                )
            )
        if parsed.netloc not in ("", "localhost"):
            raise CustomProviderValidationError(
                CustomProviderValidationFailure(
                    reason="unsupported_source_host",
                    message="Only local file:// manifest URLs are supported for custom providers.",
                    actionable_steps=(
                        "Use a local file:// URL instead of a remote host.",
                    ),
                )
            )
        path = self._local_path_from_file_url(manifest_url)
        if path.suffix.lower() != ".json":
            raise CustomProviderValidationError(
                CustomProviderValidationFailure(
                    reason="unsupported_manifest_format",
                    message="Custom provider manifest URLs must point to a .json file.",
                    actionable_steps=(
                        "Rename or replace the manifest so the URL ends with .json.",
                    ),
                )
            )
        if not path.exists() or not path.is_file():
            raise CustomProviderValidationError(
                CustomProviderValidationFailure(
                    reason="manifest_not_found",
                    message=f"Custom provider manifest file was not found: {path}",
                    actionable_steps=(
                        "Verify the local manifest path and retry the install request.",
                    ),
                )
            )
        return path

    def _validate_asset_url(self, asset_url: str) -> Optional[CustomProviderValidationFailure]:
        parsed = urlparse(asset_url)
        if parsed.scheme != "file":
            return CustomProviderValidationFailure(
                reason="unsupported_asset_source",
                message="Custom provider assets must use local file:// URLs in this step.",
                actionable_steps=(
                    "Package custom provider assets as local files and reference them with file:// URLs.",
                ),
            )
        asset_path = self._local_path_from_file_url(asset_url)
        if not asset_path.exists() or not asset_path.is_file():
            return CustomProviderValidationFailure(
                reason="asset_not_found",
                message=f"Custom provider asset file was not found: {asset_path}",
                actionable_steps=(
                    "Verify the local asset path in the manifest and retry the install request.",
                ),
            )
        return None

    def _local_path_from_file_url(self, file_url: str) -> Path:
        parsed = urlparse(file_url)
        path_text = unquote(parsed.path or "")
        if parsed.netloc and parsed.netloc != "localhost":
            path_text = f"//{parsed.netloc}{path_text}"
        if re.match(r"^/[A-Za-z]:", path_text):
            path_text = path_text[1:]
        return Path(path_text)

    def _safe_asset_name(self, asset_name: str, suffix: str) -> str:
        cleaned = _SAFE_ASSET_NAME_PATTERN.sub("-", asset_name.strip()).strip("-")
        if not cleaned:
            cleaned = "asset"
        if suffix and not cleaned.endswith(suffix):
            cleaned = f"{cleaned}{suffix}"
        return cleaned

    def _sha256_file(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()


class CustomProviderValidationError(Exception):
    def __init__(self, failure: CustomProviderValidationFailure) -> None:
        super().__init__(failure.message)
        self.failure = failure


custom_provider_registry_service = CustomProviderRegistryService()
