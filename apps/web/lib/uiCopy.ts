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
      libraryTitle: "Project Library\n项目库",
      libraryEmptyTitle: "No Projects Yet\n还没有项目",
      libraryEmptyBody:
        "Create a score in the main workspace, then return here to reopen it from the local library.\n先在主工作区生成乐谱，再回到这里从本地项目库重新打开。",
      renameAction: "Rename / 重命名",
      duplicateAction: "Duplicate / 复制",
      deleteAction: "Delete / 删除",
      openAction: "Open Project / 打开项目",
      copyLinkAction: "Copy Local Link / 复制本地链接",
      unsavedChanges: "Unsaved Changes / 有未保存修改",
      savedDraft: "Saved Draft / 已保存草稿",
      projectSettings: "Project Settings / 项目设置",
      localRouteNotice:
        "This is a stable local route, not a public share link. It works only in the same local deployment with the same project files.\n这是稳定的本地路由，不是公开分享链接，只能在同一套本地部署和项目文件下使用。"
    }
  },
  "zh-CN": {
    locale: "zh-CN",
    project: {
      libraryTitle: "Project Library\n项目库",
      libraryEmptyTitle: "No Projects Yet\n还没有项目",
      libraryEmptyBody:
        "Create a score in the main workspace, then return here to reopen it from the local library.\n先在主工作区生成乐谱，再回到这里从本地项目库重新打开。",
      renameAction: "重命名 / Rename",
      duplicateAction: "复制 / Duplicate",
      deleteAction: "删除 / Delete",
      openAction: "打开项目 / Open Project",
      copyLinkAction: "复制本地链接 / Copy Local Link",
      unsavedChanges: "有未保存修改 / Unsaved Changes",
      savedDraft: "已保存草稿 / Saved Draft",
      projectSettings: "项目设置 / Project Settings",
      localRouteNotice:
        "This is a stable local route, not a public share link. It works only in the same local deployment with the same project files.\n这是稳定的本地路由，不是公开分享链接，只能在同一套本地部署和项目文件下使用。"
    }
  }
};

export function getUiCopy(locale?: string | null): UiCopy {
  const normalizedLocale = locale === "zh-CN" ? "zh-CN" : "en";
  return COPY_BY_LOCALE[normalizedLocale];
}
