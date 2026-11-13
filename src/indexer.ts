import { App, TFile } from "obsidian";
import { TimelineEvent, TimelineSettings } from "./types";

export class TimelineIndexer {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	public getEvents(settings: TimelineSettings): TimelineEvent[] {
		const files = this.app.vault.getMarkdownFiles();
		const events: TimelineEvent[] = [];

		for (const file of files) {
			if (!this.fileMatchesFolder(file, settings)) {
				continue;
			}

			const event = this.parseFile(file, settings);
			if (event) {
				events.push(event);
			}
		}

		// Sort events chronologically by startTimestamp
		events.sort((a, b) => {
			if (a.startTimestamp !== b.startTimestamp) {
				return a.startTimestamp - b.startTimestamp;
			}
			return (b.endTimestamp - b.startTimestamp) - (a.endTimestamp - a.startTimestamp);
		});

		return events;
	}

	private fileMatchesFolder(file: TFile, settings: TimelineSettings): boolean {
		const targetFolder = settings.folder.trim().replace(/^\/+|\/+$/g, "");
		if (!targetFolder) {
			return true;
		}

		const filePath = file.path;
		if (settings.includeSubfolders) {
			return filePath.startsWith(targetFolder + "/") || filePath === targetFolder;
		} else {
			const parentPath = file.parent ? file.parent.path.replace(/^\/+|\/+$/g, "") : "";
			return parentPath === targetFolder;
		}
	}

	public parseFile(file: TFile, settings: TimelineSettings): TimelineEvent | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		// Extract start date
		let startDateRaw: any = null;
		for (const prop of settings.startDateProperties) {
			if (frontmatter && frontmatter[prop] !== undefined && frontmatter[prop] !== null) {
				startDateRaw = frontmatter[prop];
				break;
			}
		}

		// If no frontmatter property, check filename for YYYY-MM-DD
		if (!startDateRaw) {
			const filenameMatch = file.basename.match(/\b(\d{4}-\d{2}-\d{2})\b/);
			if (filenameMatch) {
				startDateRaw = filenameMatch[1];
			}
		}

		if (!startDateRaw) {
			return null;
		}

		const parsedStart = this.parseDate(startDateRaw);
		if (!parsedStart) {
			return null;
		}

		// Extract end date
		let endDateRaw: any = null;
		for (const prop of settings.endDateProperties) {
			if (frontmatter && frontmatter[prop] !== undefined && frontmatter[prop] !== null) {
				endDateRaw = frontmatter[prop];
				break;
			}
		}

		let parsedEnd: { dateStr: string; timestamp: number } | null = null;
		if (endDateRaw) {
			parsedEnd = this.parseDate(endDateRaw);
		}

		// Collect tags
		const tagsSet = new Set<string>();
		if (frontmatter) {
			if (Array.isArray(frontmatter.tags)) {
				for (const t of frontmatter.tags) {
					if (typeof t === "string") tagsSet.add(t.replace(/^#/, "").trim());
				}
			} else if (typeof frontmatter.tags === "string") {
				frontmatter.tags.split(",").forEach(t => tagsSet.add(t.replace(/^#/, "").trim()));
			}

			if (Array.isArray(frontmatter.tag)) {
				for (const t of frontmatter.tag) {
					if (typeof t === "string") tagsSet.add(t.replace(/^#/, "").trim());
				}
			} else if (typeof frontmatter.tag === "string") {
				frontmatter.tag.split(",").forEach(t => tagsSet.add(t.replace(/^#/, "").trim()));
			}
		}

		if (cache?.tags) {
			for (const t of cache.tags) {
				tagsSet.add(t.tag.replace(/^#/, "").trim());
			}
		}

		const tags = Array.from(tagsSet);

		// Determine category and color
		let matchedCategory = null;
		for (const cat of settings.categories) {
			if (!cat.enabled) continue;
			const targetTag = cat.tag.replace(/^#/, "").trim().toLowerCase();
			if (tags.some(t => t.toLowerCase() === targetTag)) {
				matchedCategory = cat;
				break;
			}
		}

		let color = settings.defaultColor;
		if (frontmatter?.color && typeof frontmatter.color === "string") {
			color = frontmatter.color;
		} else if (matchedCategory) {
			color = matchedCategory.color;
		}

		// Calculate timestamps: end date covers full day
		const isRange = parsedEnd !== null && parsedEnd.timestamp > parsedStart.timestamp;
		const startTimestamp = parsedStart.timestamp;
		// End timestamp is either the parsedEnd timestamp + 24 hours (inclusive of the end day) or startTimestamp + 24 hours
		const endTimestamp = isRange && parsedEnd ? parsedEnd.timestamp + 86400000 : startTimestamp + 86400000;

		// Summary description
		let description = "";
		if (frontmatter?.description && typeof frontmatter.description === "string") {
			description = frontmatter.description;
		} else if (frontmatter?.summary && typeof frontmatter.summary === "string") {
			description = frontmatter.summary;
		}

		return {
			file,
			title: frontmatter?.title || file.basename,
			startDate: parsedStart.dateStr,
			endDate: isRange && parsedEnd ? parsedEnd.dateStr : null,
			startTimestamp,
			endTimestamp,
			isRange,
			tags,
			categoryId: matchedCategory?.id || null,
			categoryName: matchedCategory?.name || null,
			color,
			description,
		};
	}

	public parseDate(raw: any): { dateStr: string; timestamp: number } | null {
		if (!raw) return null;

		let str = "";
		if (raw instanceof Date) {
			str = raw.toISOString().split("T")[0];
		} else {
			str = String(raw).trim();
		}

		// Matches YYYY-MM-DD
		const match = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
		if (!match) {
			return null;
		}

		const year = parseInt(match[1], 10);
		const month = parseInt(match[2], 10);
		const day = parseInt(match[3], 10);

		if (month < 1 || month > 12 || day < 1 || day > 31) {
			return null;
		}

		const pad = (n: number) => (n < 10 ? "0" + n : String(n));
		const dateStr = `${year}-${pad(month)}-${pad(day)}`;
		const timestamp = Date.UTC(year, month - 1, day);

		return { dateStr, timestamp };
	}
}
