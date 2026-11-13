import { TFile } from "obsidian";

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
	description: string;
	imageUrl: string | null;
}

export interface CategoryConfig {
	id: string;
	name: string;
	tag: string;
	color: string;
	enabled: boolean;
}

export interface TimelineSettings {
	folder: string;
	includeSubfolders: boolean;
	startDateProperties: string[];
	endDateProperties: string[];
	categories: CategoryConfig[];
	defaultColor: string;
	todayMarkerColor: string;
	defaultViewSpan: string; // e.g. "6mo", "5 days", "1 year"
	defaultViewOffset: string; // e.g. "0", "-1 month", "-3mo"
	zoomPixelsPerDay: number; // e.g. 1 to 140
	zoomSensitivity: number; // e.g. 0.3 to 2.5
	zoomAcceleration: boolean;
	labelMode: "auto" | "vertical" | "hidden" | "horizontal";
	verticalLabelMaxHeight: number;
	useAliasAsLabel: boolean;
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
		tag: "event",
		color: "var(--interactive-accent)",
		enabled: true,
	},
	{
		id: "project",
		name: "Project",
		tag: "project",
		color: "#6c849d",
		enabled: true,
	},
	{
		id: "milestone",
		name: "Milestone",
		tag: "milestone",
		color: "#779d6c",
		enabled: true,
	},
	{
		id: "deadline",
		name: "Deadline",
		tag: "deadline",
		color: "#ff3333",
		enabled: true,
	},
];

export const DEFAULT_SETTINGS: TimelineSettings = {
	folder: "Calendar",
	includeSubfolders: true,
	startDateProperties: ["date", "startDate", "start"],
	endDateProperties: ["date-end", "endDate", "end"],
	categories: DEFAULT_CATEGORIES,
	defaultColor: "var(--interactive-accent)",
	todayMarkerColor: "#ff3333",
	defaultViewSpan: "6 months",
	defaultViewOffset: "0",
	zoomPixelsPerDay: 40,
	zoomSensitivity: 1.0,
	zoomAcceleration: true,
	labelMode: "auto",
	verticalLabelMaxHeight: 120,
	useAliasAsLabel: false,
	showToday: true,
	showGrid: true,
	showDayTicks: true,
	autoScrollToToday: true,
	hiddenCategoryIds: [],
};
