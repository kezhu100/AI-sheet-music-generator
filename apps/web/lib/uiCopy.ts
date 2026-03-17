export type UiLocale = "en" | "zh-CN";

interface ProjectUiCopy {
  libraryTitle: string;
  libraryEmptyTitle: string;
  libraryEmptyBody: string;
  renameAction: string;
  duplicateAction: string;
  deleteAction: string;
  openAction: string;
  copyLinkAction: string;
  unsavedChanges: string;
  savedDraft: string;
  projectSettings: string;
  localRouteNotice: string;
}

interface UiCopy {
  locale: UiLocale;
  project: ProjectUiCopy;
}

const COPY_BY_LOCALE: Record<UiLocale, UiCopy> = {
  en: {
    locale: "en",
    project: {
      libraryTitle: "Project Library",
      libraryEmptyTitle: "No projects yet",
      libraryEmptyBody: "Create a job from the upload page, then come back here to reopen it from its stable local project route.",
      renameAction: "Rename",
      duplicateAction: "Duplicate",
      deleteAction: "Delete",
      openAction: "Open project",
      copyLinkAction: "Copy local share link",
      unsavedChanges: "Unsaved draft changes",
      savedDraft: "Saved draft baseline",
      projectSettings: "Project Settings",
      localRouteNotice:
        "This is a stable local route, not a public internet-safe share token. It only works on the same deployed instance with the same persisted project files."
    }
  },
  "zh-CN": {
    locale: "zh-CN",
    project: {
      libraryTitle: "项目库",
      libraryEmptyTitle: "还没有项目",
      libraryEmptyBody: "先在上传页创建一个任务，然后回到这里通过稳定的本地项目路由重新打开它。",
      renameAction: "重命名",
      duplicateAction: "复制",
      deleteAction: "删除",
      openAction: "打开项目",
      copyLinkAction: "复制本地链接",
      unsavedChanges: "有未保存的草稿修改",
      savedDraft: "已保存草稿基线",
      projectSettings: "项目设置",
      localRouteNotice: "这是稳定的本地路由，不是公开分享链接。它只在同一部署实例和同一组持久化项目文件下可用。"
    }
  }
};

export function getUiCopy(locale?: string | null): UiCopy {
  const normalizedLocale = locale === "zh-CN" ? "zh-CN" : "en";
  return COPY_BY_LOCALE[normalizedLocale];
}

