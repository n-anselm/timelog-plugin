import { ItemView, WorkspaceLeaf, debounce } from "obsidian";
import { TimelinePlugin } from "./main";
import { HorizontalTimelineView } from "./views/horizontalTimeline";
import { TimelineIndexer } from "./indexer";

export const VIEW_TYPE_TIMELINE = "obsidian-timeline-view";

export class TimelineView extends ItemView {
	private plugin: TimelinePlugin;
	private horizontalView: HorizontalTimelineView | null = null;
	private indexer: TimelineIndexer;
	private debouncedRefresh: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: TimelinePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.indexer = new TimelineIndexer(this.app);

		this.debouncedRefresh = debounce(() => {
			this.refresh();
		}, 300, true);
	}

	public getViewType(): string {
		return VIEW_TYPE_TIMELINE;
	}

	public getDisplayText(): string {
		return "Timelog";
	}

	public getIcon(): string {
		return "calendar-range";
	}

	async onOpen() {
		// Add refresh icon in view header
		this.addAction("refresh-cw", "Refresh timeline", () => {
			this.refresh();
		});

		// Add today icon in view header
		this.addAction("crosshair", "Jump to today", () => {
			if (this.horizontalView) {
				this.horizontalView.scrollToToday(true);
			}
		});

		this.horizontalView = new HorizontalTimelineView(
			this.app,
			this.contentEl,
			this.plugin.settings,
			() => this.plugin.saveSettingsQuiet()
		);

		this.refresh();

		// Listen for vault / metadata updates
		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.debouncedRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("create", () => {
				this.debouncedRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.debouncedRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", () => {
				this.debouncedRefresh();
			})
		);
	}

	public refresh() {
		if (!this.horizontalView) return;
		const events = this.indexer.getEvents(this.plugin.settings);
		this.horizontalView.updateData(events, this.plugin.settings);
	}

	public getHorizontalView(): HorizontalTimelineView | null {
		return this.horizontalView;
	}

	async onClose() {
		if (this.horizontalView) {
			this.horizontalView.destroy();
			this.horizontalView = null;
		}
	}
}
