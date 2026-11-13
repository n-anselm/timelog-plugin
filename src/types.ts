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
	zoomPixelsPerDay: number; // e.g. 1 to 140
	labelMode: "auto" | "vertical" | "hidden" | "horizontal";
	verticalLabelMaxHeight: number;
	showToday: boolean;
	showGrid: boolean;
	showDayTicks: boolean;
	autoScrollToToday: boolean;
	hiddenCategoryIds: string[];
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
	zoomPixelsPerDay: 40,
	labelMode: "auto",
	verticalLabelMaxHeight: 120,
	showToday: true,
	showGrid: true,
	showDayTicks: true,
	autoScrollToToday: true,
	hiddenCategoryIds: [],
};
