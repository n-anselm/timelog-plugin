import { TFile } from "obsidian";

export type MarkerShape = "circle" | "diamond" | "star" | "rect";

export interface TimelineEvent {
	file: TFile;
	title: string;
	startDate: string; // YYYY-MM-DD
	endDate: string | null; // YYYY-MM-DD or null
	startTimestamp: number; // UTC ms start of day
	endTimestamp: number; // UTC ms end of day
	isRange: boolean;
	tags: string[];
	categoryId: string | null;
	categoryName: string | null;
	color: string;
	markerShape?: MarkerShape;
	description: string;
	imageUrl: string | null;
	isRecurring?: boolean;
	originYear?: number;
	occurrenceYears?: number;
	isInitialDifferentiated?: boolean;
	isBirthday?: boolean;
}

export type ConditionOperator =
	| "is"
	| "isNot"
	| "contains"
	| "doesNotContain"
	| "startsWith"
	| "endsWith"
	| "matches"
	| "exists"
	| "doesNotExist"
	| "matchesDatePattern";

export interface FilterCondition {
	property: string; // "file.folder" | "file.tags" | "file.name" | "file.basename" | "file.path" | "file.ext" | custom frontmatter key
	operator: ConditionOperator;
	value: string;
	includeSubfolders?: boolean;
	requireAdditionalText?: boolean;
}

export interface CategoryConfig {
	id: string;
	name: string;
	tag?: string; // legacy v1.0 field migrated to conditions
	color: string;
	markerShape?: MarkerShape;
	enabled: boolean;
	useAliasAsLabel?: boolean;
	recurring?: boolean;
	isBirthday?: boolean;
	differentiateInitial?: boolean;
	matchMode?: "all" | "any";
	conditions?: FilterCondition[];
}

export interface TimelineSettings {
	folder: string;
	includeSubfolders: boolean;
	filterMode: "none" | "include" | "exclude";
	filterConditions: FilterCondition[];
	startDateProperties: string[];
	endDateProperties: string[];
	recurringYearsFuture: number;
	categories: CategoryConfig[];
	showUncategorizedNotes: boolean;
	defaultColor: string;
	todayMarkerColor: string;
	todayLineWidth: number;
	todayLineOpacity: number;
	defaultViewSpan: string; // e.g. "6mo", "5 days", "1 year"
	defaultViewOffset: string; // e.g. "0", "-1 month", "-3mo"
	zoomPixelsPerDay: number; // e.g. 1 to 140
	zoomSensitivity: number; // e.g. 0.3 to 2.5
	zoomAcceleration: boolean;
	indicatorScale: number; // e.g. 0.5 to 2.5, default 1.0
	labelMode: "auto" | "vertical" | "hidden" | "horizontal";
	verticalLabelMaxHeight: number;
	showToday: boolean;
	showGrid: boolean;
	showDayTicks: boolean;
	autoScrollToToday: boolean;
	hiddenCategoryIds: string[];
}

export function parseDurationToDays(raw: string | undefined, fallbackDays: number): number {
	if (!raw) return fallbackDays;
	const str = raw.trim().toLowerCase();
	if (!str) return fallbackDays;
	if (str === "0") return 0;

	const match = str.match(/^([+-]?\d+(?:\.\d+)?)\s*([a-z]*)$/);
	if (!match) return fallbackDays;

	const value = parseFloat(match[1]);
	if (isNaN(value)) return fallbackDays;

	const unit = match[2];
	if (unit === "y" || unit === "yr" || unit === "yrs" || unit === "year" || unit === "years") {
		return value * 365;
	}
	if (unit === "m" || unit === "mo" || unit === "mos" || unit === "month" || unit === "months") {
		return value * 30;
	}
	if (unit === "w" || unit === "wk" || unit === "wks" || unit === "week" || unit === "weeks") {
		return value * 7;
	}
	return value;
}

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
	{
		id: "event",
		name: "Event",
		color: "var(--interactive-accent)",
		enabled: true,
		matchMode: "all",
		conditions: [{ property: "file.tags", operator: "contains", value: "event" }],
	},
	{
		id: "project",
		name: "Project",
		color: "#6c849d",
		enabled: true,
		matchMode: "all",
		conditions: [{ property: "file.tags", operator: "contains", value: "project" }],
	},
	{
		id: "milestone",
		name: "Milestone",
		color: "#779d6c",
		enabled: true,
		matchMode: "all",
		conditions: [{ property: "file.tags", operator: "contains", value: "milestone" }],
	},
	{
		id: "deadline",
		name: "Deadline",
		color: "#ff3333",
		enabled: true,
		matchMode: "all",
		conditions: [{ property: "file.tags", operator: "contains", value: "deadline" }],
	},
];

export function normalizeCategoryConfig(cat: CategoryConfig): CategoryConfig {
	if (!Array.isArray(cat.conditions)) {
		const legacyTag = (cat.tag || "").replace(/^#/, "").trim();
		cat.conditions = legacyTag
			? [{ property: "file.tags", operator: "contains", value: legacyTag }]
			: [];
	}
	if (!cat.matchMode) {
		cat.matchMode = "all";
	}
	if (cat.recurring === undefined) {
		cat.recurring = false;
	}
	if (cat.useAliasAsLabel === undefined) {
		cat.useAliasAsLabel = false;
	}
	if (cat.isBirthday === undefined) {
		cat.isBirthday = false;
	}
	if (cat.differentiateInitial === undefined) {
		cat.differentiateInitial = false;
	}
	if (!cat.markerShape) {
		cat.markerShape = "circle";
	}
	return cat;
}

export const DEFAULT_SETTINGS: TimelineSettings = {
	folder: "Calendar",
	includeSubfolders: true,
	filterMode: "none",
	filterConditions: [],
	startDateProperties: ["date", "startDate", "start"],
	endDateProperties: ["date-end", "endDate", "end"],
	recurringYearsFuture: 3,
	categories: DEFAULT_CATEGORIES,
	showUncategorizedNotes: false,
	defaultColor: "var(--interactive-accent)",
	todayMarkerColor: "#ff3333",
	todayLineWidth: 2,
	todayLineOpacity: 1,
	defaultViewSpan: "6 months",
	defaultViewOffset: "0",
	zoomPixelsPerDay: 40,
	zoomSensitivity: 1.0,
	zoomAcceleration: true,
	indicatorScale: 1.0,
	labelMode: "auto",
	verticalLabelMaxHeight: 120,
	showToday: true,
	showGrid: true,
	showDayTicks: true,
	autoScrollToToday: true,
	hiddenCategoryIds: [],
};
