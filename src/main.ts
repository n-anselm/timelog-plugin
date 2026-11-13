import { Hotkey, Plugin, WorkspaceLeaf, debounce } from "obsidian";
import { DEFAULT_SETTINGS, TimelineSettings } from "./types";
import { TimelineView, VIEW_TYPE_TIMELINE } from "./timelineView";
import { TimelineSettingTab } from "./settings";
import { registerTimelineCodeBlock } from "./codeblock";
import { HorizontalTimelineView } from "./views/horizontalTimeline";

export class TimelinePlugin extends Plugin {
	public settings: TimelineSettings = DEFAULT_SETTINGS;
	private debouncedSaveData = debounce(() => {
		this.saveData(this.settings);
	}, 400, true);

	async onload() {
		await this.loadSettings();

		// Register the custom View
		this.registerView(
			VIEW_TYPE_TIMELINE,
			(leaf: WorkspaceLeaf) => new TimelineView(leaf, this)
		);

		// Add Ribbon Icon
		this.addRibbonIcon("calendar-range", "Open Timeline", () => {
			this.activateView();
		});

		// Add Command
		this.addCommand({
			id: "open-timeline-view",
			name: "Open Timeline View",
			callback: () => {
				this.activateView();
			},
		});

		this.registerTimelineActionCommand(
			"reset-default-view",
			"Reset to default view (zoom & offset)",
			[{ modifiers: [], key: "Home" }],
			(view) => view.resetToDefaultView(true)
		);

		this.registerTimelineActionCommand(
			"center-on-today",
			"Center on today",
			undefined,
			(view) => view.scrollToToday(true)
		);

		this.registerTimelineActionCommand(
			"zoom-to-fit-all",
			"Zoom out to fit all events",
			[
				{ modifiers: [], key: "0" },
				{ modifiers: [], key: "z" },
			],
			(view) => view.zoomToFitAll()
		);

		this.registerTimelineActionCommand(
			"zoom-in",
			"Zoom in",
			[{ modifiers: [], key: "=" }],
			(view) => view.stepZoomIn()
		);

		this.registerTimelineActionCommand(
			"zoom-out",
			"Zoom out",
			[{ modifiers: [], key: "-" }],
			(view) => view.stepZoomOut()
		);

		this.registerTimelineActionCommand(
			"pan-left",
			"Pan left",
			[{ modifiers: [], key: "ArrowLeft" }],
			(view) => view.panByViewportFraction(-0.15)
		);

		this.registerTimelineActionCommand(
			"pan-right",
			"Pan right",
			[{ modifiers: [], key: "ArrowRight" }],
			(view) => view.panByViewportFraction(0.15)
		);

		this.registerTimelineActionCommand(
			"jump-prev-month",
			"Jump back 1 month",
			[
				{ modifiers: ["Shift"], key: "ArrowLeft" },
				{ modifiers: [], key: "PageUp" },
			],
			(view) => view.panByDays(-30)
		);

		this.registerTimelineActionCommand(
			"jump-next-month",
			"Jump forward 1 month",
			[
				{ modifiers: ["Shift"], key: "ArrowRight" },
				{ modifiers: [], key: "PageDown" },
			],
			(view) => view.panByDays(30)
		);

		this.registerTimelineActionCommand(
			"jump-prev-year",
			"Jump back 1 year",
			undefined,
			(view) => view.panByDays(-365)
		);

		this.registerTimelineActionCommand(
			"jump-next-year",
			"Jump forward 1 year",
			undefined,
			(view) => view.panByDays(365)
		);

		this.registerTimelineActionCommand(
			"cycle-label-mode",
			"Cycle label display mode",
			[{ modifiers: [], key: "l" }],
			(view) => view.cycleLabelMode()
		);

		// Register Code Block Processor
		registerTimelineCodeBlock(this);

		// Register Settings Tab
		this.addSettingTab(new TimelineSettingTab(this.app, this));
	}

	async onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIMELINE);
	}

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshOpenViews();
	}

	public saveSettingsQuiet() {
		this.debouncedSaveData();
	}

	private registerTimelineActionCommand(
		id: string,
		name: string,
		hotkeys: Hotkey[] | undefined,
		action: (view: HorizontalTimelineView) => void
	) {
		this.addCommand({
			id,
			name,
			hotkeys,
			checkCallback: (checking: boolean) => {
				const activeTimeline = this.app.workspace.getActiveViewOfType(TimelineView);
				const hView = activeTimeline?.getHorizontalView();
				if (!hView) return false;
				if (!checking) {
					action(hView);
				}
				return true;
			},
		});
	}

	private refreshOpenViews() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);
		for (const leaf of leaves) {
			if (leaf.view instanceof TimelineView) {
				leaf.view.refresh();
			}
		}
	}

	public async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf("tab");
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_TIMELINE,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}

export default TimelinePlugin;
