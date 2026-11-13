import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, TimelineSettings } from "./types";
import { TimelineView, VIEW_TYPE_TIMELINE } from "./timelineView";
import { TimelineSettingTab } from "./settings";
import { registerTimelineCodeBlock } from "./codeblock";

export class TimelinePlugin extends Plugin {
	public settings: TimelineSettings = DEFAULT_SETTINGS;

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
