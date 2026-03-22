"use client";

import type { JobResult, ProjectDetail } from "@ai-sheet-music-generator/shared-types";

type InstrumentExportScope = "piano" | "drums";
type ExportModeName = "original" | "draft";
type ExportFormatName = "midi" | "musicxml";

interface ProjectWorkspaceExportPanelProps {
  activeResult: JobResult;
  originalResult: JobResult | null | undefined;
  projectDetail?: ProjectDetail | null;
  isExporting: (modeName: ExportModeName, format: ExportFormatName, scope: InstrumentExportScope) => boolean;
  onMidiExport: (modeName: ExportModeName, scope: InstrumentExportScope) => void;
  onMusicXmlExport: (modeName: ExportModeName, scope: InstrumentExportScope) => void;
  isExportingProjectPackage: boolean;
  onExportProjectPackage: () => void;
}

export function ProjectWorkspaceExportPanel({
  activeResult,
  originalResult,
  projectDetail,
  isExporting,
  onMidiExport,
  onMusicXmlExport,
  isExportingProjectPackage,
  onExportProjectPackage
}: ProjectWorkspaceExportPanelProps) {
  return (
    <section className="content-grid export-grid">
      <div className="panel panel-full export-panel ornate-card">
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">Export / 导出</div>
            <h2>
              Export and Handoff
              <br />
              导出与交接
            </h2>
            <p className="muted section-help">
              Export piano and drums separately by default. Use MusicXML for MuseScore handoff, use MIDI for DAW and
              MIDI-production workflows, and treat combined export as a compatibility path rather than the main handoff.
              <br />
              默认建议分别导出钢琴与鼓组。MusicXML 更适合交接到 MuseScore，MIDI 更适合 DAW 与 MIDI 制作流程；合并导出仅作为兼容路径，而不是主要交接方式。
            </p>
          </div>
        </div>
        <div className="export-card-grid">
          <article className="note-card ornate-card">
            <strong>Current Draft / 当前草稿</strong>
            <div className="muted">
              Separate-by-instrument export is the recommended path for draft review and handoff. / 按乐器分别导出是当前草稿最推荐的复核与交接方式。
            </div>
            <div className="muted">
              Recommended for MIDI / DAW: use the separate MIDI files below. / 如果要进入 MIDI / DAW 流程，推荐使用下方分开的 MIDI 文件。
            </div>
            <div className="actions">
              <button
                className="button"
                type="button"
                disabled={!activeResult || isExporting("draft", "midi", "piano")}
                onClick={() => onMidiExport("draft", "piano")}
              >
                {isExporting("draft", "midi", "piano") ? "Exporting MIDI... / 正在导出 MIDI..." : "Piano MIDI / 钢琴 MIDI"}
              </button>
              <button
                className="button"
                type="button"
                disabled={!activeResult || isExporting("draft", "midi", "drums")}
                onClick={() => onMidiExport("draft", "drums")}
              >
                {isExporting("draft", "midi", "drums") ? "Exporting MIDI... / 正在导出 MIDI..." : "Drums MIDI / 鼓组 MIDI"}
              </button>
            </div>
            <div className="muted">
              Recommended for MuseScore: use the separate MusicXML files below. / 如果要交接到 MuseScore，推荐使用下方分开的 MusicXML 文件。
            </div>
            <div className="actions">
              <button
                className="button"
                type="button"
                disabled={!activeResult || isExporting("draft", "musicxml", "piano")}
                onClick={() => onMusicXmlExport("draft", "piano")}
              >
                {isExporting("draft", "musicxml", "piano")
                  ? "Exporting MusicXML... / 正在导出 MusicXML..."
                  : "Piano MusicXML / 钢琴 MusicXML"}
              </button>
              <button
                className="button"
                type="button"
                disabled={!activeResult || isExporting("draft", "musicxml", "drums")}
                onClick={() => onMusicXmlExport("draft", "drums")}
              >
                {isExporting("draft", "musicxml", "drums")
                  ? "Exporting MusicXML... / 正在导出 MusicXML..."
                  : "Drums MusicXML / 鼓组 MusicXML"}
              </button>
            </div>
            <div className="muted">
              Combined export remains compatibility-oriented and is intentionally not the primary draft workflow here. / 合并导出仍以兼容为主，这里不会把它作为主要草稿工作流推荐。
            </div>
          </article>
          <article className="note-card ornate-card">
            <strong>Original Result / 原始结果</strong>
            <div className="muted">
              Use these files when you want the untouched completed result instead of your current draft edits. / 如果你想导出未经编辑的完成结果，而不是当前草稿修改，请使用这里的文件。
            </div>
            <div className="muted">
              MIDI is best for DAW workflows; MusicXML is best for MuseScore handoff. / MIDI 更适合 DAW 流程；MusicXML 更适合 MuseScore 交接。
            </div>
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                disabled={!originalResult || isExporting("original", "midi", "piano")}
                onClick={() => onMidiExport("original", "piano")}
              >
                {isExporting("original", "midi", "piano")
                  ? "Exporting MIDI... / 正在导出 MIDI..."
                  : "Piano MIDI / 钢琴 MIDI"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!originalResult || isExporting("original", "midi", "drums")}
                onClick={() => onMidiExport("original", "drums")}
              >
                {isExporting("original", "midi", "drums")
                  ? "Exporting MIDI... / 正在导出 MIDI..."
                  : "Drums MIDI / 鼓组 MIDI"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!originalResult || isExporting("original", "musicxml", "piano")}
                onClick={() => onMusicXmlExport("original", "piano")}
              >
                {isExporting("original", "musicxml", "piano")
                  ? "Exporting MusicXML... / 正在导出 MusicXML..."
                  : "Piano MusicXML / 钢琴 MusicXML"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!originalResult || isExporting("original", "musicxml", "drums")}
                onClick={() => onMusicXmlExport("original", "drums")}
              >
                {isExporting("original", "musicxml", "drums")
                  ? "Exporting MusicXML... / 正在导出 MusicXML..."
                  : "Drums MusicXML / 鼓组 MusicXML"}
              </button>
            </div>
          </article>
          <article className="note-card ornate-card">
            <strong>MuseScore Handoff / MuseScore 交接</strong>
            <div className="muted">
              Recommended path: export separate draft MusicXML files for piano and drums, then import each file into
              MuseScore for final notation cleanup. / 推荐路径：分别导出钢琴与鼓组的草稿 MusicXML，再按对应任务分别导入 MuseScore 做最终记谱整理。
            </div>
            <div className="muted">
              Piano MusicXML is best for piano score cleanup. Drums MusicXML is best for drum-staff cleanup. / Piano MusicXML 更适合钢琴谱整理；Drums MusicXML 更适合鼓谱整理。
            </div>
            <div className="actions">
              <button
                className="button"
                type="button"
                disabled={!activeResult || isExporting("draft", "musicxml", "piano")}
                onClick={() => onMusicXmlExport("draft", "piano")}
              >
                {isExporting("draft", "musicxml", "piano")
                  ? "Preparing Piano handoff... / 正在准备钢琴交接..."
                  : "Piano for MuseScore / 交接钢琴到 MuseScore"}
              </button>
              <button
                className="button"
                type="button"
                disabled={!activeResult || isExporting("draft", "musicxml", "drums")}
                onClick={() => onMusicXmlExport("draft", "drums")}
              >
                {isExporting("draft", "musicxml", "drums")
                  ? "Preparing Drums handoff... / 正在准备鼓组交接..."
                  : "Drums for MuseScore / 交接鼓组到 MuseScore"}
              </button>
            </div>
            <div className="muted">
              This downloads separate MusicXML files only. Combined export is intentionally de-emphasized here because
              separate handoff is usually cleaner in MuseScore. / 这里只下载分开的 MusicXML 文件。由于分别交接通常更适合 MuseScore，因此这里会弱化合并导出。
            </div>
          </article>
          <article className="note-card ornate-card">
            <strong>Project Package / 项目打包</strong>
            <div className="muted">Export the local-first project bundle as a ZIP package. / 将本地优先项目导出为 ZIP 压缩包。</div>
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                disabled={!projectDetail || isExportingProjectPackage}
                onClick={onExportProjectPackage}
              >
                {isExportingProjectPackage
                  ? "Exporting Project... / 正在导出项目..."
                  : "Export Project (.zip) / 导出项目（.zip）"}
              </button>
            </div>
            {!projectDetail ? (
              <div className="muted">Reopen the project from the local library to export the full package. / 请先从本地项目库重新打开项目，再导出完整项目包。</div>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
}
