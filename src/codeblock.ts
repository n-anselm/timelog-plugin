import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { TimelinePlugin } from "./main";
import { HorizontalTimelineView } from "./views/horizontalTimeline";
import { TimelineIndexer } from "./indexer";
import { TimelineSettings } from "./types";

export function registerTimelineCodeBlock(plugin: TimelinePlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		"timeline",
		(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			const indexer = new TimelineIndexer(plugin.app);

			// Parse YAML-like options from codeblock content
			const lines = source.split("\n");
			const configOverride: Partial<TimelineSettings> = {};

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;

				const colonIdx = trimmed.indexOf(":");
				if (colonIdx === -1) continue;

				const key = trimmed.substring(0, colonIdx).trim().toLowerCase();
				const val = trimmed.substring(colonIdx + 1).trim();

				if (key === "folder") {
					configOverride.folder = val.replace(/^["']|["']$/g, "");
				} else if (key === "zoom") {
					const num = parseInt(val, 10);
					if (!isNaN(num)) configOverride.zoomPixelsPerDay = Math.max(1, Math.min(140, num));
				} else if (key === "labels" || key === "labelmode") {
					const mode = val.toLowerCase();
					if (["auto", "vertical", "hidden", "horizontal"].includes(mode)) {
						configOverride.labelMode = mode as any;
					}
				}
			}

			const mergedSettings: TimelineSettings = {
				...plugin.settings,
				...configOverride,
			};

			const wrapper = el.createDiv({ cls: "embedded-timeline-container" });
			const view = new HorizontalTimelineView(
				plugin.app,
				wrapper,
				mergedSettings,
				() => {}
			);

			const events = indexer.getEvents(mergedSettings);
			view.updateData(events, mergedSettings);

			const child = new MarkdownRenderChild(wrapper);
			child.onunload = () => view.destroy();
			ctx.addChild(child);
		}
	);
}
