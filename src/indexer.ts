import { App, TFile } from "obsidian";
import {
	CategoryConfig,
	FilterCondition,
	TimelineEvent,
	TimelineSettings,
	normalizeCategoryConfig,
} from "./types";

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
			if (!this.filePassesGlobalFilter(file, settings)) {
				continue;
			}

			const parsedEvents = this.parseFile(file, settings);
			if (parsedEvents.length > 0) {
				events.push(...parsedEvents);
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

	private filePassesGlobalFilter(file: TFile, settings: TimelineSettings): boolean {
		const mode = settings.filterMode || "none";
		const conditions = settings.filterConditions || [];
		if (mode === "none" || conditions.length === 0) {
			return true;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		const tags = this.extractTags(cache);
		const matchesAll = conditions.every((c) =>
			this.evaluateCondition(file, cache?.frontmatter, tags, c)
		);
		return mode === "include" ? matchesAll : !matchesAll;
	}

	private extractTags(cache: any): string[] {
		const tagsSet = new Set<string>();
		const frontmatter = cache?.frontmatter;
		if (frontmatter) {
			if (Array.isArray(frontmatter.tags)) {
				for (const t of frontmatter.tags) {
					if (typeof t === "string") tagsSet.add(t.replace(/^#/, "").trim());
				}
			} else if (typeof frontmatter.tags === "string") {
				frontmatter.tags
					.split(/[,\s]+/)
					.forEach((t: string) => {
						const cl = t.replace(/^#/, "").trim();
						if (cl) tagsSet.add(cl);
					});
			}

			if (Array.isArray(frontmatter.tag)) {
				for (const t of frontmatter.tag) {
					if (typeof t === "string") tagsSet.add(t.replace(/^#/, "").trim());
				}
			} else if (typeof frontmatter.tag === "string") {
				frontmatter.tag
					.split(/[,\s]+/)
					.forEach((t: string) => {
						const cl = t.replace(/^#/, "").trim();
						if (cl) tagsSet.add(cl);
					});
			}
		}

		if (cache?.tags) {
			for (const t of cache.tags) {
				tagsSet.add(t.tag.replace(/^#/, "").trim());
			}
		}

		return Array.from(tagsSet);
	}

	public evaluateCondition(
		file: TFile,
		frontmatter: Record<string, any> | undefined,
		tags: string[],
		condition: FilterCondition
	): boolean {
		const property = condition.property || "file.tags";
		const operator = condition.operator || "contains";
		const rawVal = (condition.value ?? "").trim();

		// Tag conditions support comma-separated tag lists (like Linear Calendar)
		if (property === "file.tags") {
			if (operator === "exists") return tags.length > 0;
			if (operator === "doesNotExist") return tags.length === 0;

			const targetTags = rawVal
				.split(",")
				.map((t) => t.replace(/^#/, "").trim().toLowerCase())
				.filter((t) => t.length > 0);
			if (targetTags.length === 0) return false;

			const lowerTags = tags.map((t) => t.toLowerCase());
			if (operator === "is") {
				return targetTags.every((target) => lowerTags.some((t) => t === target));
			}
			if (operator === "isNot") {
				return !targetTags.some((target) => lowerTags.some((t) => t === target));
			}
			if (operator === "contains") {
				return targetTags.some((target) =>
					lowerTags.some((t) => t === target || t.includes(target))
				);
			}
			if (operator === "doesNotContain") {
				return !targetTags.some((target) =>
					lowerTags.some((t) => t === target || t.includes(target))
				);
			}
			return false;
		}

		let actualValue: any;
		if (property === "file.name") {
			actualValue = file.name;
		} else if (property === "file.basename") {
			actualValue = file.basename;
		} else if (property === "file.folder") {
			actualValue = file.parent ? file.parent.path.replace(/^\/+|\/+$/g, "") : "";
		} else if (property === "file.path") {
			actualValue = file.path;
		} else if (property === "file.ext") {
			actualValue = file.extension;
		} else {
			const propKey = property.startsWith("property:") ? property.slice(9) : property;
			actualValue = frontmatter ? frontmatter[propKey] : undefined;
		}

		if (operator === "exists") {
			return actualValue !== undefined && actualValue !== null && String(actualValue).trim() !== "";
		}
		if (operator === "doesNotExist") {
			return actualValue === undefined || actualValue === null || String(actualValue).trim() === "";
		}

		if (operator === "matchesDatePattern") {
			const fmt = rawVal || "YYYY-MM-DD";
			const regexStr = fmt
				.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
				.replace(/YYYY/g, "\\d{4}")
				.replace(/YY/g, "\\d{2}")
				.replace(/MM/g, "\\d{2}")
				.replace(/DD/g, "\\d{2}");
			const match = file.basename.match(new RegExp(`^(${regexStr})`));
			if (!match) return false;
			if (condition.requireAdditionalText) {
				return file.basename.trim().length > match[0].length;
			}
			return true;
		}

		const targetLower = rawVal.toLowerCase();

		if (property === "file.folder" && (operator === "is" || operator === "isNot")) {
			const cleanFolder = rawVal.replace(/^\/+|\/+$/g, "").toLowerCase();
			const parentLower = String(actualValue || "").toLowerCase();
			let isMatch = parentLower === cleanFolder;
			if (condition.includeSubfolders && cleanFolder) {
				isMatch = isMatch || file.path.toLowerCase().startsWith(cleanFolder + "/");
			}
			return operator === "is" ? isMatch : !isMatch;
		}

		if (actualValue === undefined || actualValue === null) {
			return operator === "isNot" || operator === "doesNotContain";
		}

		const valuesList: string[] = Array.isArray(actualValue)
			? actualValue.map((v) => String(v))
			: [String(actualValue)];

		switch (operator) {
			case "is":
				return valuesList.some((v) => v.toLowerCase() === targetLower);
			case "isNot":
				return !valuesList.some((v) => v.toLowerCase() === targetLower);
			case "contains":
				if (!targetLower) return false;
				return valuesList.some((v) => v.toLowerCase().includes(targetLower));
			case "doesNotContain":
				if (!targetLower) return true;
				return !valuesList.some((v) => v.toLowerCase().includes(targetLower));
			case "startsWith":
				if (!targetLower) return false;
				return valuesList.some((v) => v.toLowerCase().startsWith(targetLower));
			case "endsWith":
				if (!targetLower) return false;
				return valuesList.some((v) => v.toLowerCase().endsWith(targetLower));
			case "matches":
				try {
					const re = new RegExp(rawVal, "i");
					return valuesList.some((v) => re.test(v));
				} catch {
					return false;
				}
			default:
				return false;
		}
	}

	private categoryMatchesFile(
		cat: CategoryConfig,
		file: TFile,
		frontmatter: Record<string, any> | undefined,
		tags: string[]
	): boolean {
		normalizeCategoryConfig(cat);
		const conds = cat.conditions || [];
		if (conds.length === 0) return false;
		const mode = cat.matchMode || "all";
		if (mode === "any") {
			return conds.some((c) => this.evaluateCondition(file, frontmatter, tags, c));
		}
		return conds.every((c) => this.evaluateCondition(file, frontmatter, tags, c));
	}

	public parseFile(file: TFile, settings: TimelineSettings): TimelineEvent[] {
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
			return [];
		}

		const parsedStart = this.parseDate(startDateRaw);
		if (!parsedStart) {
			return [];
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
		const tags = this.extractTags(cache);

		// Determine category and color (first enabled matching category wins)
		let matchedCategory: CategoryConfig | null = null;
		let matchesDisabledCategory = false;
		for (const cat of settings.categories) {
			if (this.categoryMatchesFile(cat, file, frontmatter, tags)) {
				if (cat.enabled) {
					matchedCategory = cat;
					break;
				} else {
					matchesDisabledCategory = true;
				}
			}
		}

		// If the note matches a disabled category (and no enabled category), exclude it
		if (!matchedCategory && matchesDisabledCategory) {
			return [];
		}

		// Hide uncategorized notes unless showUncategorizedNotes is enabled
		if (!matchedCategory && !(settings.showUncategorizedNotes ?? false)) {
			return [];
		}

		let color = settings.defaultColor;
		if (frontmatter?.color && typeof frontmatter.color === "string") {
			color = frontmatter.color;
		} else if (matchedCategory) {
			color = matchedCategory.color;
		}

		// Summary description
		let description = "";
		if (frontmatter?.description && typeof frontmatter.description === "string") {
			description = frontmatter.description;
		} else if (frontmatter?.summary && typeof frontmatter.summary === "string") {
			description = frontmatter.summary;
		}

		// Image preview URL
		const imageUrl = this.resolveImageUrl(frontmatter?.image, file.path);

		// Determine event title (alias if enabled and present, else frontmatter title or basename)
		let title = frontmatter?.title || file.basename;
		if (settings.useAliasAsLabel && frontmatter) {
			const rawAlias = frontmatter.aliases ?? frontmatter.alias;
			if (Array.isArray(rawAlias) && rawAlias.length > 0 && rawAlias[0] != null) {
				const first = String(rawAlias[0]).trim();
				if (first) title = first;
			} else if (typeof rawAlias === "string" && rawAlias.trim()) {
				title = rawAlias.split(",")[0].trim();
			}
		}

		if (matchedCategory?.recurring && matchedCategory?.isBirthday) {
			const suffix = title.endsWith("s") || title.endsWith("S") ? "' birthday" : "'s birthday";
			title = `${title}${suffix}`;
		}

		// Recurring yearly generation
		if (matchedCategory?.recurring) {
			const startDateObj = new Date(parsedStart.timestamp);
			const originYear = startDateObj.getUTCFullYear();
			const originMonth = startDateObj.getUTCMonth() + 1; // 1-12
			const originDay = startDateObj.getUTCDate(); // 1-31

			const currentYear = new Date().getFullYear();
			const futureHorizon = Math.max(0, settings.recurringYearsFuture ?? 3);
			let maxTimestampLimit = Date.UTC(currentYear + futureHorizon, 11, 31, 23, 59, 59);

			// If an end date property exists on a recurring event, treat it as the recurrence stop bound
			const parsedStopBound = parsedEnd
				? parsedEnd.timestamp
				: this.parseRecurrenceEndYearBound(endDateRaw);
			if (parsedStopBound !== null) {
				maxTimestampLimit = Math.min(maxTimestampLimit, parsedStopBound);
			}

			const maxYear = new Date(maxTimestampLimit).getUTCFullYear();
			const pad = (n: number) => (n < 10 ? "0" + n : String(n));
			const occurrences: TimelineEvent[] = [];

			for (let yr = originYear; yr <= maxYear; yr++) {
				// Clamp Feb 29 to Feb 28 on non-leap years
				const daysInMonth = new Date(Date.UTC(yr, originMonth, 0)).getUTCDate();
				const dayForYear = Math.min(originDay, daysInMonth);
				const occTimestamp = Date.UTC(yr, originMonth - 1, dayForYear);

				if (occTimestamp < parsedStart.timestamp || occTimestamp > maxTimestampLimit) {
					continue;
				}

				const occDateStr = `${yr}-${pad(originMonth)}-${pad(dayForYear)}`;
				occurrences.push({
					file,
					title,
					startDate: occDateStr,
					endDate: null,
					startTimestamp: occTimestamp,
					endTimestamp: occTimestamp + 86400000,
					isRange: false,
					tags,
					categoryId: matchedCategory.id,
					categoryName: matchedCategory.name,
					color,
					description,
					imageUrl,
					isRecurring: true,
					originYear,
					occurrenceYears: yr - originYear,
				});
			}

			return occurrences;
		}

		// Non-recurring event: calculate timestamps (end date covers full day)
		const isRange = parsedEnd !== null && parsedEnd.timestamp > parsedStart.timestamp;
		const startTimestamp = parsedStart.timestamp;
		const endTimestamp = isRange && parsedEnd ? parsedEnd.timestamp + 86400000 : startTimestamp + 86400000;

		return [
			{
				file,
				title,
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
				imageUrl,
			},
		];
	}

	private parseRecurrenceEndYearBound(raw: any): number | null {
		if (raw === undefined || raw === null) return null;
		const str = String(raw).trim();
		// Support bare 4-digit end year (e.g. "2018") or range like "1950 - 2018"
		const yearOnly = str.match(/^(\d{4})$/) || str.match(/^\d{4}\s*[-–—]\s*(\d{4})$/);
		if (yearOnly) {
			const yr = parseInt(yearOnly[1], 10);
			if (yr >= 1000 && yr <= 9999) {
				return Date.UTC(yr, 11, 31, 23, 59, 59);
			}
		}
		return null;
	}

	private resolveImageUrl(raw: any, sourcePath: string): string | null {
		if (!raw) return null;
		const val = Array.isArray(raw) ? raw[0] : raw;
		if (typeof val !== "string") return null;

		let link = val.trim();
		if (!link) return null;

		if (/^(https?:|data:|app:)/i.test(link)) {
			return link;
		}

		const wikiMatch = link.match(/^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
		const mdMatch = link.match(/^!?\[[^\]]*\]\(([^)]+)\)$/);
		if (wikiMatch) {
			link = wikiMatch[1].trim();
		} else if (mdMatch) {
			link = mdMatch[1].trim();
		}

		const target =
			this.app.metadataCache.getFirstLinkpathDest(link, sourcePath) ||
			this.app.vault.getFileByPath(link.replace(/^\/+/, ""));

		return target instanceof TFile ? this.app.vault.getResourcePath(target) : null;
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

		const timestamp = Date.UTC(year, month - 1, day);
		const check = new Date(timestamp);
		if (
			check.getUTCFullYear() !== year ||
			check.getUTCMonth() !== month - 1 ||
			check.getUTCDate() !== day
		) {
			return null;
		}

		const pad = (n: number) => (n < 10 ? "0" + n : String(n));
		const dateStr = `${year}-${pad(month)}-${pad(day)}`;

		return { dateStr, timestamp };
	}
}
