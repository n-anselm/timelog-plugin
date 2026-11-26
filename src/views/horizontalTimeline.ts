import { App, Menu, TFile, setIcon } from "obsidian";
import {
	MarkerStyle,
	TimelineEvent,
	TimelineSettings,
	getContrastingIconColor,
	normalizeCategoryConfig,
	parseDurationToDays,
} from "../types";

interface TimelineCluster {
	events: TimelineEvent[];
	startX: number; // center X coordinate in track pixels
	isRange: boolean;
	color: string;
}

export class HorizontalTimelineView {
	private app: App;
	private containerEl: HTMLElement;
	private settings: TimelineSettings;
	private events: TimelineEvent[] = [];
	private onSettingsChange: () => void;

	// Viewport & Scale State
	private pixelsPerDay: number;
	private minTimestamp: number = 0;
	private maxTimestamp: number = 0;
	private totalDays: number = 0;

	// Persistent DOM nodes (never destroyed during zoom)
	private toolbarEl: HTMLElement | null = null;
	private scrollWrapperEl: HTMLElement | null = null;
	private timelineTrackEl: HTMLElement | null = null;
	private rulerEl: HTMLElement | null = null;
	private monthsRowEl: HTMLElement | null = null;
	private daysRowEl: HTMLElement | null = null;
	private rulerCursorEl: HTMLElement | null = null;
	private trackContentEl: HTMLElement | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private tooltipEl: HTMLElement | null = null;
	private tooltipHideTimer: number | null = null;
	private tooltipFadeTimer: number | null = null;
	private subTooltipEl: HTMLElement | null = null;
	private subTooltipHideTimer: number | null = null;
	private subTooltipFadeTimer: number | null = null;
	private lightboxEl: HTMLElement | null = null;
	private lightboxFadeTimer: number | null = null;
	private onWindowKeyDown: ((e: KeyboardEvent) => void) | null = null;
	private zoomRafId: number | null = null;
	private pendingZoom: { newPx: number; cursorScreenX: number; targetDay: number } | null = null;
	private renderedDaysStart: number = -1;
	private renderedDaysEnd: number = -1;
	private isInitialRender: boolean = true;
	private lastAppliedViewSpan: string = "";
	private lastAppliedViewOffset: string = "";
	private searchQuery: string = "";

	// Dragging & Momentum Physics state
	private isDragging: boolean = false;
	private startX: number = 0;
	private scrollLeft: number = 0;
	private animFrameId: number | null = null;
	private lastMouseX: number = 0;
	private lastMouseTime: number = 0;
	private panVelocity: number = 0;
	private onWindowMouseUp: (() => void) | null = null;
	private lastWheelZoomTime: number = 0;
	private wheelZoomBurst: number = 0;
	private lastCursorScreenX: number | null = null;

	// Zoom hint UI
	private zoomHintEl: HTMLElement | null = null;
	private zoomHintHideTimer: number | null = null;

	// Active filter state
	private activeHiddenCategoryIds: Set<string>;
	private isDraggingCategoryPills: boolean = false;
	private categoryDragHideState: boolean = false;

	constructor(
		app: App,
		containerEl: HTMLElement,
		settings: TimelineSettings,
		onSettingsChange: () => void
	) {
		this.app = app;
		this.containerEl = containerEl;
		this.settings = settings;
		this.pixelsPerDay = settings.zoomPixelsPerDay || 40;
		this.activeHiddenCategoryIds = new Set(settings.hiddenCategoryIds || []);
		this.onSettingsChange = onSettingsChange;
	}

	public updateData(events: TimelineEvent[], settings: TimelineSettings) {
		this.events = events;
		this.settings = settings;
		this.render();
	}

	private computeDefaultZoomPixelsPerDay(): number {
		const spanDays = Math.max(1, parseDurationToDays(this.settings.defaultViewSpan, 180));
		const viewWidth = this.scrollWrapperEl?.clientWidth || this.containerEl.clientWidth || 1200;
		return Math.max(1, Math.min(140, Math.round(viewWidth / spanDays)));
	}

	public render() {
		this.containerEl.addClass("obsidian-timeline-wrapper");

		// Initialize persistent DOM structure once
		if (
			!this.toolbarEl ||
			!this.scrollWrapperEl ||
			!this.timelineTrackEl ||
			!this.rulerEl ||
			!this.monthsRowEl ||
			!this.daysRowEl ||
			!this.trackContentEl
		) {
			this.containerEl.empty();
			this.containerEl.tabIndex = 0;
			this.toolbarEl = this.containerEl.createDiv({ cls: "timeline-toolbar" });
			this.scrollWrapperEl = this.containerEl.createDiv({ cls: "timeline-scroll-wrapper" });
			this.timelineTrackEl = this.scrollWrapperEl.createDiv({ cls: "timeline-track" });
			this.rulerEl = this.timelineTrackEl.createDiv({ cls: "timeline-ruler" });
			this.monthsRowEl = this.rulerEl.createDiv({ cls: "timeline-ruler-months" });
			this.daysRowEl = this.rulerEl.createDiv({ cls: "timeline-ruler-days" });
			this.rulerCursorEl = this.rulerEl.createDiv({ cls: "timeline-ruler-cursor" });
			this.trackContentEl = this.timelineTrackEl.createDiv({ cls: "timeline-track-content" });
			this.zoomHintEl = this.containerEl.createDiv({
				cls: "timeline-zoom-hint",
				text: "Hold Ctrl to zoom out farther",
			});

			this.setupInteractionHandlers(this.scrollWrapperEl);
			this.setupTooltip();
		}

		// Calculate bounds
		const filteredEvents = this.getFilteredEvents();
		this.calculateBounds(filteredEvents);

		const spanChanged =
			this.settings.defaultViewSpan !== this.lastAppliedViewSpan ||
			this.settings.defaultViewOffset !== this.lastAppliedViewOffset;

		if (this.isInitialRender || spanChanged) {
			this.lastAppliedViewSpan = this.settings.defaultViewSpan;
			this.lastAppliedViewOffset = this.settings.defaultViewOffset;
			this.pixelsPerDay = this.computeDefaultZoomPixelsPerDay();
		}

		// Update toolbar buttons, categories, and sliders
		this.updateToolbar();

		// Render track contents
		this.renderTrack();

		if (this.isInitialRender || spanChanged) {
			this.isInitialRender = false;
			if (this.settings.autoScrollToToday) {
				setTimeout(() => {
					this.pixelsPerDay = this.computeDefaultZoomPixelsPerDay();
					this.renderTrack();
					this.scrollToDefaultView(false);
				}, 50);
			}
		}
	}

	private getFilteredEvents(): TimelineEvent[] {
		const q = this.searchQuery.trim().toLowerCase();
		return this.events.filter((e) => {
			if (e.categoryId && this.activeHiddenCategoryIds.has(e.categoryId)) {
				return false;
			}
			if (q) {
				const inTitle = e.title.toLowerCase().includes(q);
				const inDesc = e.description && e.description.toLowerCase().includes(q);
				const inTags = e.tags.some((t) => t.toLowerCase().includes(q));
				const inCat = e.categoryName && e.categoryName.toLowerCase().includes(q);
				if (!inTitle && !inDesc && !inTags && !inCat) {
					return false;
				}
			}
			return true;
		});
	}

	private calculateBounds(events: TimelineEvent[]) {
		const now = new Date();
		const currentYear = now.getFullYear();
		const todayTimestamp = Date.UTC(currentYear, now.getMonth(), now.getDate());

		let min = todayTimestamp;
		let max = todayTimestamp;

		if (events.length > 0) {
			min = events[0].startTimestamp;
			max = events[0].endTimestamp;
			for (const ev of events) {
				if (ev.startTimestamp < min) min = ev.startTimestamp;
				if (ev.endTimestamp > max) max = ev.endTimestamp;
			}
		}

		// Broad multi-year horizon:
		// Ensure we cover at least from (minYear - 1) Jan 1 to (maxYear + 1) Dec 31
		const eventMinYear = new Date(min).getUTCFullYear();
		const eventMaxYear = new Date(max).getUTCFullYear();
		const minYear = Math.min(currentYear - 1, eventMinYear - 1);
		const maxYear = Math.max(currentYear + 1, eventMaxYear + 1);

		this.minTimestamp = Date.UTC(minYear, 0, 1);
		this.maxTimestamp = Date.UTC(maxYear, 11, 31, 23, 59, 59);

		const dayMs = 86400000;
		this.totalDays = Math.ceil((this.maxTimestamp - this.minTimestamp) / dayMs) + 1;
	}

	private updateToolbar() {
		if (!this.toolbarEl) return;
		this.toolbarEl.empty();

		// Left: Navigation & Today
		const leftGroup = this.toolbarEl.createDiv({ cls: "timeline-toolbar-group" });

		const todayBtn = leftGroup.createEl("button", {
			text: "Today",
			cls: "timeline-btn timeline-btn-today mod-cta",
		});
		todayBtn.onclick = () => this.scrollToToday(true);

		const prevYearBtn = leftGroup.createEl("button", {
			cls: "timeline-btn timeline-btn-nav",
			title: "Jump back 1 year",
		});
		setIcon(prevYearBtn.createSpan({ cls: "timeline-btn-lucide" }), "chevrons-left");
		prevYearBtn.createSpan({ text: "Year" });
		prevYearBtn.onclick = () => this.panByDays(-365);

		const prevMonthBtn = leftGroup.createEl("button", {
			cls: "timeline-btn timeline-btn-nav",
			title: "Jump back 1 month",
		});
		setIcon(prevMonthBtn.createSpan({ cls: "timeline-btn-lucide" }), "chevron-left");
		prevMonthBtn.createSpan({ text: "Month" });
		prevMonthBtn.onclick = () => this.panByDays(-30);

		const nextMonthBtn = leftGroup.createEl("button", {
			cls: "timeline-btn timeline-btn-nav",
			title: "Jump forward 1 month",
		});
		nextMonthBtn.createSpan({ text: "Month" });
		setIcon(nextMonthBtn.createSpan({ cls: "timeline-btn-lucide" }), "chevron-right");
		nextMonthBtn.onclick = () => this.panByDays(30);

		const nextYearBtn = leftGroup.createEl("button", {
			cls: "timeline-btn timeline-btn-nav",
			title: "Jump forward 1 year",
		});
		nextYearBtn.createSpan({ text: "Year" });
		setIcon(nextYearBtn.createSpan({ cls: "timeline-btn-lucide" }), "chevrons-right");
		nextYearBtn.onclick = () => this.panByDays(365);

		// Middle: Category Filter Pills
		const filterGroup = this.toolbarEl.createDiv({ cls: "timeline-toolbar-group timeline-categories-group" });
		for (const rawCat of this.settings.categories) {
			const cat = normalizeCategoryConfig(rawCat);
			if (!cat.enabled) continue;
			const isHidden = this.activeHiddenCategoryIds.has(cat.id);
			const pill = filterGroup.createDiv({
				cls: `timeline-category-pill ${isHidden ? "is-hidden" : ""}`,
			});

			const iconId = cat.markerIcon || "dot";
			const style: MarkerStyle = cat.markerStyle || "filled";
			const contrast = getContrastingIconColor(cat.color);
			const dot = pill.createSpan({
				cls: `category-dot is-style-${style} ${iconId === "dot" ? "is-dot-only" : "has-lucide-icon"}`,
			});
			dot.style.setProperty("--event-color", cat.color);
			dot.style.setProperty("--event-contrast", contrast);
			if (iconId !== "dot") {
				setIcon(dot, iconId);
			} else if (style === "outlined") {
				setIcon(dot, "circle");
			}

			pill.createSpan({ text: cat.name, cls: "category-name" });

			const setCategoryHidden = (shouldHide: boolean) => {
				const currentlyHidden = this.activeHiddenCategoryIds.has(cat.id);
				if (currentlyHidden === shouldHide) return;
				if (shouldHide) {
					this.activeHiddenCategoryIds.add(cat.id);
				} else {
					this.activeHiddenCategoryIds.delete(cat.id);
				}
				pill.toggleClass("is-hidden", shouldHide);
				this.settings.hiddenCategoryIds = Array.from(this.activeHiddenCategoryIds);
				this.onSettingsChange();
				this.renderTrack();
			};

			pill.onmousedown = (e: MouseEvent) => {
				if (e.button !== 0) return;
				e.preventDefault();
				this.isDraggingCategoryPills = true;
				this.categoryDragHideState = !this.activeHiddenCategoryIds.has(cat.id);
				setCategoryHidden(this.categoryDragHideState);
			};

			pill.onmouseenter = (e: MouseEvent) => {
				if (!this.isDraggingCategoryPills) return;
				if ((e.buttons & 1) === 0) {
					this.isDraggingCategoryPills = false;
					return;
				}
				setCategoryHidden(this.categoryDragHideState);
			};
		}

		// Right: Search, Zoom & Label Controls
		const rightGroup = this.toolbarEl.createDiv({ cls: "timeline-toolbar-group" });

		// Quick search input
		const searchWrapper = rightGroup.createDiv({ cls: "timeline-search-wrapper" });
		this.searchInputEl = searchWrapper.createEl("input", {
			type: "search",
			cls: "timeline-search-input",
			placeholder: "Filter events… (/)",
		});
		this.searchInputEl.value = this.searchQuery;
		this.searchInputEl.oninput = () => {
			this.searchQuery = this.searchInputEl?.value || "";
			this.renderTrack();
		};
		this.searchInputEl.onkeydown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				if (this.searchQuery) {
					this.searchQuery = "";
					if (this.searchInputEl) this.searchInputEl.value = "";
					this.renderTrack();
				}
				this.containerEl.focus({ preventScroll: true });
			}
		};

		// Label mode dropdown
		const labelModeSelect = rightGroup.createEl("select", { cls: "timeline-select" });
		const modes: { id: "auto" | "vertical" | "hidden" | "horizontal"; label: string }[] = [
			{ id: "auto", label: "Labels: Auto" },
			{ id: "vertical", label: "Labels: Vertical" },
			{ id: "hidden", label: "Labels: Hidden" },
			{ id: "horizontal", label: "Labels: Horizontal" },
		];
		for (const m of modes) {
			const opt = labelModeSelect.createEl("option", { text: m.label, value: m.id });
			if (this.settings.labelMode === m.id) opt.selected = true;
		}
		labelModeSelect.onchange = (e) => {
			this.settings.labelMode = (e.target as HTMLSelectElement).value as any;
			this.onSettingsChange();
			this.renderTrack();
		};

		// Settings Button (icon only)
		const settingsBtn = rightGroup.createEl("button", {
			cls: "timeline-btn timeline-btn-icon",
			title: "Open Timelog Settings",
		});
		setIcon(settingsBtn.createSpan({ cls: "timeline-btn-lucide" }), "settings");
		settingsBtn.onclick = () => {
			const setting = (this.app as any).setting;
			if (setting) {
				setting.open();
				setting.openTabById("obsidian-timeline");
			}
		};
	}

	public applyZoom(newPx: number, cursorScreenX?: number, targetDay?: number) {
		// Calculate minimum zoom to fit entire timeline in viewport
		const viewWidth = this.scrollWrapperEl?.clientWidth || this.containerEl.clientWidth || 1200;
		const minZoomToFit = this.totalDays > 0 ? viewWidth / this.totalDays : 0.1;
		const minZoom = Math.max(0.1, minZoomToFit);
		const clamped = Math.max(minZoom, Math.min(140, newPx));
		if (Math.abs(clamped - this.pixelsPerDay) < 0.001) return;

		if (!this.scrollWrapperEl) return;

		if (cursorScreenX === undefined || targetDay === undefined) {
			cursorScreenX = this.scrollWrapperEl.clientWidth / 2;
			const cursorTrackX = this.scrollWrapperEl.scrollLeft + cursorScreenX;
			targetDay = cursorTrackX / this.pixelsPerDay;
		}

		this.pixelsPerDay = clamped;
		this.settings.zoomPixelsPerDay = clamped;
		this.onSettingsChange();

		// Re-render ONLY track contents without destroying outer containers
		this.renderTrack();

		// Keep the target day locked under the cursor
		const targetScrollLeft = Math.max(0, Math.round(targetDay * clamped - cursorScreenX));
		this.scrollWrapperEl.scrollLeft = targetScrollLeft;
		this.renderVisibleRulerDays(true);

		requestAnimationFrame(() => {
			if (this.scrollWrapperEl) {
				this.scrollWrapperEl.scrollLeft = targetScrollLeft;
				this.renderVisibleRulerDays(true);
			}
		});
	}

	private renderTrack() {
		if (!this.timelineTrackEl || !this.trackContentEl || !this.scrollWrapperEl) return;

		this.trackContentEl.empty();
		const minWidth = this.scrollWrapperEl.clientWidth || 900;
		const trackWidth = Math.max(minWidth, this.totalDays * this.pixelsPerDay);
		this.timelineTrackEl.style.width = `${trackWidth}px`;

		const filteredEvents = this.getFilteredEvents();

		// 1. Render Ruler (Year / Month / Day hierarchy) into persistent rulerEl
		this.renderRuler(this.trackContentEl);

		// 2. Render Today Indicator
		if (this.settings.showToday) {
			this.renderTodayMarker(this.trackContentEl);
		}

		// 3. Render Central Line, Events, and Merged Clusters
		this.renderTimelineLineAndEvents(this.trackContentEl, filteredEvents);
	}

	private renderRuler(trackEl: HTMLElement) {
		if (!this.rulerEl || !this.monthsRowEl || !this.daysRowEl) return;

		const isCollapsed = this.pixelsPerDay < 30;
		this.rulerEl.toggleClass("is-days-hidden", isCollapsed);
		this.daysRowEl.toggleClass("is-collapsed", isCollapsed);

		const monthsRow = this.monthsRowEl;
		monthsRow.empty();
		this.renderedDaysStart = -1;
		this.renderedDaysEnd = -1;

		const dayMs = 86400000;
		const monthNamesFull = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		const monthNamesShort = [
			"Jan", "Feb", "Mar", "Apr", "May", "Jun",
			"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
		];

		const viewWidth = this.scrollWrapperEl?.clientWidth || 1200;
		// Hide monthly dividers once a full year (365 days) is half the viewport width or narrower
		const hideMonthlyDividers = 365 * this.pixelsPerDay <= viewWidth * 0.5;

		let currentMonth = -1;
		let currentMonthYear = -1;
		let currentMonthStartDay = 0;
		let currentMonthDaysCount = 0;

		const flushMonth = () => {
			if (currentMonth !== -1 && currentMonthDaysCount > 0) {
				if (hideMonthlyDividers && currentMonth !== 0) {
					return;
				}
				const mEl = monthsRow.createDiv({
					cls: `timeline-month-block ${hideMonthlyDividers ? "is-year-block" : ""}`,
				});
				mEl.style.left = `${currentMonthStartDay * this.pixelsPerDay}px`;
				mEl.style.width = `${currentMonthDaysCount * this.pixelsPerDay}px`;

				// Adaptive month header depending on zoom
				if (hideMonthlyDividers) {
					mEl.createSpan({
						text: String(currentMonthYear),
						cls: "timeline-month-label timeline-year-label",
					});
				} else if (this.pixelsPerDay >= 12) {
					mEl.createSpan({
						text: `${monthNamesFull[currentMonth]} ${currentMonthYear}`,
						cls: "timeline-month-label",
					});
				} else if (this.pixelsPerDay >= 5) {
					mEl.createSpan({
						text: currentMonth === 0 ? String(currentMonthYear) : monthNamesShort[currentMonth],
						cls: `timeline-month-label ${currentMonth === 0 ? "timeline-year-label" : ""}`,
					});
				} else if (currentMonth === 0) {
					// Ultra-zoomed out (< 5px/day): only show Year labels at the start of each year
					mEl.createSpan({
						text: String(currentMonthYear),
						cls: "timeline-month-label timeline-year-label",
					});
				}
			}
		};

		let firstMondayIndex = -1;
		for (let i = 0; i < this.totalDays; i++) {
			const date = new Date(this.minTimestamp + i * dayMs);
			const month = date.getUTCMonth();
			const year = date.getUTCFullYear();
			const dayOfMonth = date.getUTCDate();
			const dayOfWeek = date.getUTCDay();

			if (firstMondayIndex === -1 && dayOfWeek === 1) {
				firstMondayIndex = i;
			}

			if (month !== currentMonth || year !== currentMonthYear) {
				flushMonth();
				currentMonth = month;
				currentMonthYear = year;
				currentMonthStartDay = i;
				currentMonthDaysCount = 1;
			} else {
				currentMonthDaysCount++;
			}

			// Grid lines when zoomed out (< 15px/day): monthly above the year-half-screen breakpoint, yearly at/below it
			if (
				this.settings.showGrid &&
				this.pixelsPerDay < 15 &&
				dayOfMonth === 1 &&
				(!hideMonthlyDividers || month === 0)
			) {
				const gridLine = trackEl.createDiv({ cls: "timeline-grid-line is-month-start" });
				gridLine.style.left = `${i * this.pixelsPerDay}px`;
			}
		}

		flushMonth();

		// Weekly Monday grid lines (>= 15px/day) via a single CSS repeating background instead of hundreds of DOM nodes
		if (this.settings.showGrid && this.pixelsPerDay >= 15 && firstMondayIndex >= 0) {
			const weekGrid = trackEl.createDiv({ cls: "timeline-week-grid-layer" });
			const weekPx = 7 * this.pixelsPerDay;
			weekGrid.style.backgroundSize = `${weekPx}px 100%`;
			weekGrid.style.backgroundPosition = `${firstMondayIndex * this.pixelsPerDay}px 0`;
		}

		this.renderVisibleRulerDays(true);
		this.updateRulerCursorPosition();
	}

	private renderVisibleRulerDays(force: boolean = false) {
		if (!this.daysRowEl || !this.scrollWrapperEl) return;
		if (this.pixelsPerDay < 30) {
			return;
		}

		const viewLeft = this.scrollWrapperEl.scrollLeft;
		const viewWidth = this.scrollWrapperEl.clientWidth || 1200;
		const bufferDays = 14;
		const startDay = Math.max(0, Math.floor(viewLeft / this.pixelsPerDay) - bufferDays);
		const endDay = Math.min(
			this.totalDays - 1,
			Math.ceil((viewLeft + viewWidth) / this.pixelsPerDay) + bufferDays
		);

		if (
			!force &&
			this.renderedDaysStart !== -1 &&
			startDay >= this.renderedDaysStart - 4 &&
			endDay <= this.renderedDaysEnd + 4
		) {
			return;
		}

		this.renderedDaysStart = startDay;
		this.renderedDaysEnd = endDay;
		this.daysRowEl.empty();

		const dayMs = 86400000;
		const weekdayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
		const frag = document.createDocumentFragment();

		for (let i = startDay; i <= endDay; i++) {
			const date = new Date(this.minTimestamp + i * dayMs);
			const dayOfMonth = date.getUTCDate();
			const dayOfWeek = date.getUTCDay();

			const dayEl = document.createElement("div");
			dayEl.className = `timeline-day-tick ${dayOfWeek === 0 || dayOfWeek === 6 ? "is-weekend" : ""}`;
			dayEl.style.left = `${i * this.pixelsPerDay}px`;
			dayEl.style.width = `${this.pixelsPerDay}px`;

			const numEl = document.createElement("div");
			numEl.className = "day-number";
			numEl.textContent = String(dayOfMonth);
			dayEl.appendChild(numEl);

			if (this.pixelsPerDay >= 46) {
				const nameEl = document.createElement("div");
				nameEl.className = "day-name";
				nameEl.textContent = weekdayNames[dayOfWeek];
				dayEl.appendChild(nameEl);
			}

			frag.appendChild(dayEl);
		}

		this.daysRowEl.appendChild(frag);
	}

	private renderTodayMarker(trackEl: HTMLElement) {
		const now = new Date();
		const todayTimestamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		const dayMs = 86400000;
		const offsetDays = (todayTimestamp - this.minTimestamp) / dayMs;

		if (offsetDays >= 0 && offsetDays <= this.totalDays) {
			const todayMarker = trackEl.createDiv({ cls: "timeline-today-marker" });
			todayMarker.style.setProperty("--today-color", this.settings.todayMarkerColor || "#ff3333");
			const lineWidth = this.settings.todayLineWidth ?? 2;
			const lineOpacity = this.settings.todayLineOpacity ?? 1;
			todayMarker.style.setProperty("--today-line-width", `${lineWidth}px`);
			todayMarker.style.setProperty("--today-line-opacity", String(lineOpacity));
			const x = offsetDays * this.pixelsPerDay + this.pixelsPerDay / 2;
			todayMarker.style.left = `${x}px`;

			todayMarker.createDiv({ cls: "timeline-today-badge", text: "TODAY" });
			todayMarker.createDiv({ cls: "timeline-today-line" });
		}
	}

	private renderTimelineLineAndEvents(trackEl: HTMLElement, events: TimelineEvent[]) {
		const stageEl = trackEl.createDiv({ cls: "timeline-stage" });
		const indicatorScale = this.settings.indicatorScale ?? 1.0;
		stageEl.style.setProperty("--indicator-scale", String(indicatorScale));

		// The Single Central Continuous Axis Line
		stageEl.createDiv({ cls: "timeline-central-axis" });

		// Day tick marks on the axis (shown when pixelsPerDay >= 30, same threshold as auto text labels)
		// Rendered as a single repeating-linear-gradient layer instead of thousands of individual DOM nodes
		if (this.settings.showDayTicks && this.pixelsPerDay >= 30) {
			const ticksLayer = stageEl.createDiv({ cls: "timeline-day-ticks-layer" });
			ticksLayer.style.height = this.pixelsPerDay >= 65 ? "24px" : "18px";
			ticksLayer.style.backgroundSize = `${this.pixelsPerDay}px 100%`;
		}

		// Effective label mode
		let effectiveLabelMode = this.settings.labelMode;
		if (effectiveLabelMode === "auto") {
			if (this.pixelsPerDay < 30) {
				effectiveLabelMode = "hidden";
			} else if (this.pixelsPerDay < 65) {
				effectiveLabelMode = "vertical";
			} else {
				effectiveLabelMode = "horizontal";
			}
		}

		// Multi-day bar thickness: normal (12px) at >= 30 px/day, very small (6px) when zoomed out
		let barHeightPx = this.pixelsPerDay >= 30 ? 12 : 6;
		barHeightPx = Math.max(3, Math.round(barHeightPx * indicatorScale));

		const dayMs = 86400000;

		// Count single-day point events per date so same-day events can spread across the day cell
		const pointCountsByDate = new Map<string, number>();
		const pointIndexByDate = new Map<string, number>();
		for (const ev of events) {
			if (!ev.isRange) {
				pointCountsByDate.set(ev.startDate, (pointCountsByDate.get(ev.startDate) || 0) + 1);
			}
		}

		const eventCenterX = new Map<TimelineEvent, number>();
		for (const ev of events) {
			const startOffsetDays = (ev.startTimestamp - this.minTimestamp) / dayMs;
			const startX = startOffsetDays * this.pixelsPerDay;
			if (ev.isRange) {
				eventCenterX.set(ev, startX);
			} else {
				const count = pointCountsByDate.get(ev.startDate) || 1;
				const idx = pointIndexByDate.get(ev.startDate) || 0;
				pointIndexByDate.set(ev.startDate, idx + 1);
				const fraction = count > 1 ? (idx + 1) / (count + 1) : 0.5;
				eventCenterX.set(ev, startX + fraction * this.pixelsPerDay);
			}
		}

		// CLUSTERING ALGORITHM:
		// When events are within clusterDistancePx of each other, group them into a Merged Dot!
		// At >= 30 px/day (when day columns & labels are visible), same-day events split out instead of staying trapped in a cluster.
		const clusterDistancePx = Math.round(22 * indicatorScale);
		const unclusterSameDay = this.pixelsPerDay >= 30;
		const clusters: TimelineCluster[] = [];

		for (const ev of events) {
			const centerX = eventCenterX.get(ev)!;

			if (clusters.length > 0 && !unclusterSameDay) {
				const last = clusters[clusters.length - 1];
				const dist = Math.abs(centerX - last.startX);

				// Cluster condition: within threshold and neither is a long spanning bar
				const isLongBar = ev.isRange && (ev.endTimestamp - ev.startTimestamp) / dayMs * this.pixelsPerDay > 40;
				if (dist < clusterDistancePx && !isLongBar && !last.isRange) {
					last.events.push(ev);
					last.startX = (last.startX * (last.events.length - 1) + centerX) / last.events.length;
					continue;
				}
			}

			clusters.push({
				events: [ev],
				startX: centerX,
				isRange: ev.isRange,
				color: ev.color,
			});
		}

		// Staggering trackers for individual labels
		const tierHeights = [28, 64, 100];
		const lastLabelRightAbove = [-999, -999, -999];
		const lastLabelRightBelow = [-999, -999, -999];
		const minLabelSpacingPx = effectiveLabelMode === "vertical" ? 28 : 100;

		for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
			const cluster = clusters[cIdx];

			// CASE 1: MULTIPLE EVENTS MERGED INTO A CLUSTER DOT
			if (cluster.events.length > 1) {
				const clusterEl = stageEl.createDiv({ cls: "timeline-cluster-dot" });
				clusterEl.style.left = `${cluster.startX}px`;
				clusterEl.setText(String(cluster.events.length));

				// Hover: show list of all merged events
				clusterEl.onmouseenter = (e) => {
					this.cancelHideTooltip();
					this.showClusterTooltip(cluster, e);
				};
				clusterEl.onmouseleave = () => {
					this.scheduleHideTooltip();
				};

				// Click: smoothly zoom in directly centered on this cluster!
				clusterEl.onclick = (e) => {
					e.stopPropagation();
					if (this.scrollWrapperEl) {
						const cursorScreenX = cluster.startX - this.scrollWrapperEl.scrollLeft;
						const targetDay = cluster.startX / this.pixelsPerDay;
						const nextZoom = Math.min(140, Math.max(30, Math.round(this.pixelsPerDay * 2.2)));
						this.applyZoom(nextZoom, cursorScreenX, targetDay);
					}
				};

				continue;
			}

			// CASE 2: SINGLE EVENT (NOT MERGED)
			const ev = cluster.events[0];
			const startOffsetDays = (ev.startTimestamp - this.minTimestamp) / dayMs;
			const startX = startOffsetDays * this.pixelsPerDay;
			const centerX = eventCenterX.get(ev)!;

			let widthPx = this.pixelsPerDay;
			if (ev.isRange) {
				const durationDays = Math.max(1, Math.round((ev.endTimestamp - ev.startTimestamp) / dayMs));
				widthPx = durationDays * this.pixelsPerDay;
			}

			// EVENT CONTAINER
			const contrastColor = getContrastingIconColor(ev.color);
			const iconId = ev.markerIcon || "dot";
			const markerStyle: MarkerStyle = ev.markerStyle || "filled";
			const catScale = ev.indicatorScale ?? 1.0;
			const effectiveIndicatorScale = indicatorScale * catScale;
			const eventEl = stageEl.createDiv({
				cls: `timeline-event-item ${ev.isRange ? "is-range" : "is-point"}`,
			});
			eventEl.style.setProperty("--event-color", ev.color);
			eventEl.style.setProperty("--event-contrast", contrastColor);
			eventEl.style.setProperty("--indicator-scale", String(effectiveIndicatorScale));

			// 1. MARKER ON CENTRAL AXIS
			if (ev.isRange) {
				// Multi-day Bar directly on the line, starting with the category icon/marker at the start of the bar
				eventEl.style.left = `${startX}px`;
				eventEl.style.width = `${widthPx}px`;

				const bar = eventEl.createDiv({ cls: "timeline-event-bar" });
				const effectiveBarHeightPx = Math.max(3, Math.round(barHeightPx * catScale));
				bar.style.height = `${effectiveBarHeightPx}px`;
				bar.style.backgroundColor = ev.color;

				if (iconId !== "dot" || markerStyle === "outlined") {
					const startIconEl = eventEl.createDiv({
						cls: `timeline-event-dot is-range-start-marker is-style-${markerStyle} ${
							iconId === "dot" ? "is-dot-only" : "has-lucide-icon"
						}`,
					});
					this.populateMarkerIcon(startIconEl, iconId, markerStyle);
				}
			} else {
				// Single-day Marker directly on the line
				eventEl.style.left = `${centerX}px`;

				const dot = eventEl.createDiv({
					cls: `timeline-event-dot is-style-${markerStyle} ${
						iconId === "dot" ? "is-dot-only" : "has-lucide-icon"
					} ${ev.isInitialDifferentiated ? "is-initial-differentiated" : ""}`,
				});
				this.populateMarkerIcon(dot, iconId, markerStyle);
			}

			// 2. STEM & LABEL IF NOT HIDDEN
			const needsStemLabel = effectiveLabelMode !== "hidden";

			if (needsStemLabel) {
				const labelAnchorX = ev.isRange ? startX + Math.min(20, widthPx / 2) : centerX;

				let chosenSide: "above" | "below" = cIdx % 2 === 0 ? "above" : "below";
				let chosenTier = 0;

				const lastRights = chosenSide === "above" ? lastLabelRightAbove : lastLabelRightBelow;
				let foundTier = false;

				for (let t = 0; t < tierHeights.length; t++) {
					if (labelAnchorX >= lastRights[t] + minLabelSpacingPx) {
						chosenTier = t;
						foundTier = true;
						break;
					}
				}

				if (!foundTier) {
					const altSide = chosenSide === "above" ? "below" : "above";
					const altRights = altSide === "above" ? lastLabelRightAbove : lastLabelRightBelow;
					for (let t = 0; t < tierHeights.length; t++) {
						if (labelAnchorX >= altRights[t] + minLabelSpacingPx) {
							chosenSide = altSide;
							chosenTier = t;
							foundTier = true;
							break;
						}
					}
				}

				if (!foundTier) {
					chosenTier = tierHeights.length - 1;
				}

				if (chosenSide === "above") {
					lastLabelRightAbove[chosenTier] = labelAnchorX;
				} else {
					lastLabelRightBelow[chosenTier] = labelAnchorX;
				}

				const stemHeight = tierHeights[chosenTier];

				// Stem
				const stem = eventEl.createDiv({
					cls: `timeline-event-stem pos-${chosenSide}`,
				});
				stem.style.left = ev.isRange ? `${Math.min(20, widthPx / 2)}px` : "0px";
				stem.style.height = `${stemHeight}px`;

				// Label
				const label = eventEl.createDiv({
					cls: `timeline-event-label pos-${chosenSide} mode-${effectiveLabelMode} ${
						ev.isInitialDifferentiated ? "is-initial-origin" : ""
					}`,
				});
				label.style.left = ev.isRange ? `${Math.min(20, widthPx / 2)}px` : "0px";
				if (chosenSide === "above") {
					label.style.bottom = `calc(50% + ${stemHeight}px)`;
				} else {
					label.style.top = `calc(50% + ${stemHeight}px)`;
				}

				if (ev.isInitialDifferentiated) {
					const originBadge = label.createSpan({
						text: "★ ",
						cls: "timeline-origin-star",
					});
					originBadge.style.color = ev.color;
				}
				label.createSpan({ text: ev.title });
				label.style.borderLeftColor = ev.color;
				if (effectiveLabelMode === "vertical") {
					label.style.maxHeight = `${this.settings.verticalLabelMaxHeight || 120}px`;
				}
			}

			// CLICK TO OPEN NOTE
			eventEl.onclick = (e) => {
				e.stopPropagation();
				this.app.workspace.getLeaf().openFile(ev.file);
			};

			// RIGHT-CLICK MENU
			eventEl.oncontextmenu = (e) => {
				e.preventDefault();
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Open note in new tab")
						.setIcon("file-text")
						.onClick(() => {
							this.app.workspace.getLeaf("tab").openFile(ev.file);
						});
				});
				menu.showAtMouseEvent(e);
			};

			// HOVER TOOLTIP & PREVIEW
			eventEl.onmouseenter = (e) => {
				this.cancelHideTooltip();
				this.showTooltip(ev, e);
				this.app.workspace.trigger("hover-link", {
					event: e,
					source: "timeline-view",
					hoverParent: this.containerEl,
					targetEl: eventEl,
					linktext: ev.file.path,
					sourcePath: ev.file.path,
				});
			};

			eventEl.onmouseleave = () => {
				this.scheduleHideTooltip();
			};
		}
	}

	private populateMarkerIcon(el: HTMLElement, iconId: string, style: MarkerStyle) {
		const effectiveIcon = iconId !== "dot" ? iconId : style === "outlined" ? "circle" : "";
		if (!effectiveIcon) return;

		setIcon(el, effectiveIcon);
		let fgSvg = el.querySelector("svg");
		if (!fgSvg) {
			setIcon(el, "circle");
			fgSvg = el.querySelector("svg");
		}
		if (!fgSvg) return;

		fgSvg.classList.add("lucide-fg-icon");
		if (style === "outlined") {
			const bgSvg = fgSvg.cloneNode(true) as SVGElement;
			bgSvg.classList.remove("lucide-fg-icon");
			bgSvg.classList.add("lucide-knockout-contour");
			bgSvg.setAttribute("aria-hidden", "true");
			el.insertBefore(bgSvg, fgSvg);
		}
	}

	private setupTooltip() {
		if (this.tooltipEl) {
			this.tooltipEl.remove();
		}
		this.tooltipEl = document.createElement("div");
		this.tooltipEl.className = "timeline-floating-tooltip";
		this.tooltipEl.style.display = "none";
		this.tooltipEl.onmouseenter = () => {
			this.cancelHideTooltip();
		};
		this.tooltipEl.onmouseleave = () => {
			if (!this.isLightboxVisible() && !this.subTooltipEl?.matches(":hover")) {
				this.scheduleHideTooltip();
			}
		};
		document.body.appendChild(this.tooltipEl);

		if (this.subTooltipEl) {
			this.subTooltipEl.remove();
		}
		this.subTooltipEl = document.createElement("div");
		this.subTooltipEl.className = "timeline-floating-tooltip is-sub-tooltip";
		this.subTooltipEl.style.display = "none";
		this.subTooltipEl.onmouseenter = () => {
			this.cancelHideTooltip();
			this.cancelHideSubTooltip();
		};
		this.subTooltipEl.onmouseleave = () => {
			if (!this.isLightboxVisible()) {
				this.scheduleHideSubTooltip();
				if (!this.tooltipEl?.matches(":hover")) {
					this.scheduleHideTooltip();
				}
			}
		};
		document.body.appendChild(this.subTooltipEl);

		if (this.lightboxEl) {
			this.lightboxEl.remove();
		}
		this.lightboxEl = document.createElement("div");
		this.lightboxEl.className = "timeline-image-lightbox";
		this.lightboxEl.style.display = "none";
		document.body.appendChild(this.lightboxEl);

		if (this.onWindowKeyDown) {
			window.removeEventListener("keydown", this.onWindowKeyDown, true);
		}
		this.onWindowKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (this.isLightboxVisible()) {
					e.preventDefault();
					e.stopPropagation();
					this.hideImageLightbox();
				} else if (this.subTooltipEl && this.subTooltipEl.style.display !== "none") {
					this.hideSubTooltip();
				} else if (this.tooltipEl && this.tooltipEl.style.display !== "none") {
					this.hideTooltip();
				}
			}
		};
		window.addEventListener("keydown", this.onWindowKeyDown, true);
	}

	private formatDateForDisplay(dateStr: string, includeYear: boolean = true): string {
		if (!dateStr) return "";
		const match = dateStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
		if (!match) return dateStr;

		const year = parseInt(match[1], 10);
		const month = parseInt(match[2], 10) - 1;
		const day = parseInt(match[3], 10);

		const monthNames = [
			"Jan", "Feb", "Mar", "Apr", "May", "Jun",
			"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
		];
		const weekdayNames = [
			"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
		];

		const utcDate = new Date(Date.UTC(year, month, day));
		const weekdayName = weekdayNames[utcDate.getUTCDay()] || "";
		const monthName = monthNames[month] || "";
		const showWeekday = this.settings?.showTooltipWeekday ?? true;
		const weekdayPrefix = showWeekday && weekdayName ? `(${weekdayName}) ` : "";

		return includeYear
			? `${weekdayPrefix}${monthName} ${day}, ${year}`
			: `${weekdayPrefix}${monthName} ${day}`;
	}

	private formatEventDateDisplay(ev: TimelineEvent): string {
		if (ev.isRange && ev.endDate) {
			const startYear = ev.startDate.slice(0, 4);
			const endYear = ev.endDate.slice(0, 4);
			const sameYear = startYear === endYear;
			const startFormatted = this.formatDateForDisplay(ev.startDate, !sameYear);
			const endFormatted = this.formatDateForDisplay(ev.endDate, true);
			return `${startFormatted} - ${endFormatted}`;
		}
		return this.formatDateForDisplay(ev.startDate, true);
	}

	private getRelativeTimeMessage(ev: TimelineEvent): string {
		const now = new Date();
		const todayYear = now.getFullYear();
		const todayMonth = now.getMonth();
		const todayDay = now.getDate();
		const todayTimestamp = Date.UTC(todayYear, todayMonth, todayDay);

		const startMatch = ev.startDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
		if (!startMatch) return "";

		const evStartYear = parseInt(startMatch[1], 10);
		const evStartMonth = parseInt(startMatch[2], 10) - 1;
		const evStartDay = parseInt(startMatch[3], 10);
		const evStartTimestamp = Date.UTC(evStartYear, evStartMonth, evStartDay);

		let evEndTimestamp = evStartTimestamp;
		if (ev.isRange && ev.endDate) {
			const endMatch = ev.endDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
			if (endMatch) {
				evEndTimestamp = Date.UTC(parseInt(endMatch[1], 10), parseInt(endMatch[2], 10) - 1, parseInt(endMatch[3], 10));
			}
		}

		const dayMs = 86400000;

		// Check if multi-day event is currently ongoing
		if (ev.isRange && todayTimestamp >= evStartTimestamp && todayTimestamp <= evEndTimestamp) {
			const daysLeft = Math.round((evEndTimestamp - todayTimestamp) / dayMs);
			if (daysLeft === 0) return "Ongoing (ends today)";
			if (daysLeft === 1) return "Ongoing (ends tomorrow)";
			return `Ongoing (ends in ${daysLeft} days)`;
		}

		const diffDays = Math.round((evStartTimestamp - todayTimestamp) / dayMs);

		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "In 1 day (Tomorrow)";
		if (diffDays === -1) return "1 day ago (Yesterday)";

		const isFuture = diffDays > 0;

		const startYear = isFuture ? todayYear : evStartYear;
		const startMonth = isFuture ? todayMonth : evStartMonth;
		const startDay = isFuture ? todayDay : evStartDay;

		const endYear = isFuture ? evStartYear : todayYear;
		const endMonth = isFuture ? evStartMonth : todayMonth;
		const endDay = isFuture ? evStartDay : todayDay;

		let years = endYear - startYear;
		let months = endMonth - startMonth;
		let days = endDay - startDay;

		if (days < 0) {
			const daysInPrevMonth = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
			days += daysInPrevMonth;
			months--;
		}

		if (months < 0) {
			years--;
			months += 12;
		}

		const parts: string[] = [];
		if (years > 0) {
			parts.push(`${years} year${years > 1 ? "s" : ""}`);
		}
		if (months > 0) {
			parts.push(`${months} month${months > 1 ? "s" : ""}`);
		}
		if (years === 0 && days > 0) {
			parts.push(`${days} day${days > 1 ? "s" : ""}`);
		} else if (parts.length === 0) {
			parts.push(`${days} day${days > 1 ? "s" : ""}`);
		}

		const timeSpan = parts.slice(0, 2).join(", ");
		return isFuture ? `In ${timeSpan}` : `${timeSpan} ago`;
	}

	private populateEventTooltipContent(
		container: HTMLElement,
		ev: TimelineEvent,
		onImageLoad: () => void
	) {
		container.empty();

		const titleRow = container.createDiv({ cls: "tooltip-title" });
		if (ev.isInitialDifferentiated) {
			const star = titleRow.createSpan({ text: "★ ", cls: "timeline-origin-star" });
			star.style.color = ev.color;
		}
		titleRow.createSpan({ text: ev.title });

		const dateRow = container.createDiv({ cls: "tooltip-date-row" });
		dateRow.setText(this.formatEventDateDisplay(ev));

		// Relative Time Message (e.g. "In 5 days" or "3 years, 2 months ago")
		const relativeTimeStr = this.getRelativeTimeMessage(ev);
		if (relativeTimeStr) {
			container.createDiv({
				cls: "tooltip-relative-time",
				text: relativeTimeStr,
			});
		}

		// Recurrence year count & origin year on subsequent occurrences, or origin badge on initial event
		if (ev.isRecurring && ev.occurrenceYears && ev.occurrenceYears > 0 && ev.originYear) {
			const yrsLabel = ev.occurrenceYears === 1 ? "1 year" : `${ev.occurrenceYears} years`;
			container.createDiv({
				cls: "tooltip-recurrence-info",
				text: `${yrsLabel} (since ${ev.originYear})`,
			});
		} else if (ev.isInitialDifferentiated && ev.originYear) {
			container.createDiv({
				cls: "tooltip-recurrence-info is-origin",
				text: ev.isBirthday ? `★ Born (${ev.originYear})` : `★ Initial event (${ev.originYear})`,
			});
		}

		if (ev.categoryName) {
			const badge = container.createSpan({
				cls: "tooltip-category-badge",
				text: ev.categoryName,
			});
			badge.style.setProperty("--badge-color", ev.color);
		}

		if (ev.imageUrl) {
			const imgEl = container.createEl("img", {
				cls: "tooltip-image",
				attr: { src: ev.imageUrl, alt: ev.title },
			});
			imgEl.onload = onImageLoad;
			imgEl.onmouseenter = () => {
				this.cancelHideTooltip();
				this.cancelHideSubTooltip();
				this.showImageLightbox(ev.imageUrl!, ev.title);
			};
		}

		if (ev.description) {
			const descEl = container.createDiv({ cls: "tooltip-desc" });
			descEl.setText(ev.description);
		}
	}

	private showTooltip(ev: TimelineEvent, mouseEvent: MouseEvent) {
		if (!this.tooltipEl) return;
		this.hideSubTooltip();
		this.populateEventTooltipContent(this.tooltipEl, ev, () => this.positionTooltip(mouseEvent));

		this.tooltipEl.removeClass("is-hiding");
		this.tooltipEl.style.display = "block";
		this.positionTooltip(mouseEvent);
	}

	private showSubTooltip(ev: TimelineEvent, anchorEl: HTMLElement) {
		if (!this.subTooltipEl) return;
		this.cancelHideSubTooltip();
		this.populateEventTooltipContent(this.subTooltipEl, ev, () =>
			this.positionSubTooltip(anchorEl)
		);

		this.subTooltipEl.removeClass("is-hiding");
		this.subTooltipEl.style.display = "block";
		this.positionSubTooltip(anchorEl);
	}

	private positionSubTooltip(anchorEl: HTMLElement) {
		if (!this.subTooltipEl || !this.tooltipEl) return;
		const parentRect = this.tooltipEl.getBoundingClientRect();
		const itemRect = anchorEl.getBoundingClientRect();
		const subWidth = this.subTooltipEl.offsetWidth || 240;
		const subHeight = this.subTooltipEl.offsetHeight || 110;

		let left = parentRect.right + 8;
		if (left + subWidth > window.innerWidth - 10) {
			left = parentRect.left - subWidth - 8;
		}

		let top = itemRect.top - 6;
		if (top + subHeight > window.innerHeight - 10) {
			top = window.innerHeight - subHeight - 10;
		}

		this.subTooltipEl.style.left = `${Math.max(10, left)}px`;
		this.subTooltipEl.style.top = `${Math.max(10, top)}px`;
	}

	private cancelHideSubTooltip() {
		if (this.subTooltipHideTimer !== null) {
			window.clearTimeout(this.subTooltipHideTimer);
			this.subTooltipHideTimer = null;
		}
		if (this.subTooltipFadeTimer !== null) {
			window.clearTimeout(this.subTooltipFadeTimer);
			this.subTooltipFadeTimer = null;
		}
		if (this.subTooltipEl) {
			this.subTooltipEl.removeClass("is-hiding");
		}
	}

	private scheduleHideSubTooltip(delayMs: number = 160) {
		this.cancelHideSubTooltip();
		this.subTooltipHideTimer = window.setTimeout(() => {
			this.subTooltipHideTimer = null;
			this.hideSubTooltip();
		}, delayMs);
	}

	private hideSubTooltip() {
		if (this.subTooltipHideTimer !== null) {
			window.clearTimeout(this.subTooltipHideTimer);
			this.subTooltipHideTimer = null;
		}
		if (!this.subTooltipEl || this.subTooltipEl.style.display === "none") return;

		this.subTooltipEl.addClass("is-hiding");
		this.subTooltipFadeTimer = window.setTimeout(() => {
			this.subTooltipFadeTimer = null;
			if (this.subTooltipEl) {
				this.subTooltipEl.removeClass("is-hiding");
				this.subTooltipEl.style.display = "none";
			}
		}, 120);
	}

	private showClusterTooltip(cluster: TimelineCluster, mouseEvent: MouseEvent) {
		if (!this.tooltipEl) return;
		this.hideSubTooltip();
		this.tooltipEl.empty();

		const titleRow = this.tooltipEl.createDiv({ cls: "tooltip-title" });
		titleRow.createSpan({ text: `${cluster.events.length} Events Merged` });

		const hint = this.tooltipEl.createDiv({
			cls: "tooltip-cluster-hint",
			text: "Click bubble to zoom in",
		});

		const listEl = this.tooltipEl.createDiv({ cls: "tooltip-cluster-list" });
		for (const ev of cluster.events) {
			const item = listEl.createDiv({ cls: "tooltip-cluster-item" });
			const iconId = ev.markerIcon || "dot";
			const markerStyle: MarkerStyle = ev.markerStyle || "filled";
			const contrastColor = getContrastingIconColor(ev.color);
			const dot = item.createSpan({
				cls: `tooltip-item-dot is-style-${markerStyle} ${
					iconId === "dot" ? "is-dot-only" : "has-lucide-icon"
				}`,
			});
			dot.style.setProperty("--event-color", ev.color);
			dot.style.setProperty("--event-contrast", contrastColor);
			this.populateMarkerIcon(dot, iconId, markerStyle);

			const titleSpan = item.createSpan({ cls: "tooltip-item-title" });
			if (ev.isInitialDifferentiated) {
				const star = titleSpan.createSpan({ text: "★ ", cls: "timeline-origin-star" });
				star.style.color = ev.color;
			}
			titleSpan.createSpan({ text: ev.title });

			let dateStr = this.formatEventDateDisplay(ev);
			if (ev.isRecurring && ev.occurrenceYears && ev.occurrenceYears > 0 && ev.originYear) {
				const yrsLabel = ev.occurrenceYears === 1 ? "1 year" : `${ev.occurrenceYears} years`;
				dateStr += ` · ${yrsLabel} (since ${ev.originYear})`;
			}
			item.createSpan({ text: dateStr, cls: "tooltip-item-date" });

			item.onmouseenter = (e) => {
				this.cancelHideTooltip();
				this.showSubTooltip(ev, item);
				this.app.workspace.trigger("hover-link", {
					event: e,
					source: "timeline-view",
					hoverParent: this.containerEl,
					targetEl: item,
					linktext: ev.file.path,
					sourcePath: ev.file.path,
				});
			};

			item.onmouseleave = () => {
				this.scheduleHideSubTooltip();
			};

			item.onclick = (e) => {
				e.stopPropagation();
				this.app.workspace.getLeaf().openFile(ev.file);
			};
		}

		this.tooltipEl.removeClass("is-hiding");
		this.tooltipEl.style.display = "block";
		this.positionTooltip(mouseEvent);
	}

	private positionTooltip(e: MouseEvent) {
		if (!this.tooltipEl) return;
		const tipWidth = this.tooltipEl.offsetWidth || 240;
		const tipHeight = this.tooltipEl.offsetHeight || 90;

		let left = e.clientX + 14;
		let top = e.clientY + 14;

		if (left + tipWidth > window.innerWidth) {
			left = e.clientX - tipWidth - 14;
		}
		if (top + tipHeight > window.innerHeight) {
			top = e.clientY - tipHeight - 14;
		}

		this.tooltipEl.style.left = `${Math.max(10, left)}px`;
		this.tooltipEl.style.top = `${Math.max(10, top)}px`;
	}

	private isLightboxVisible(): boolean {
		return !!this.lightboxEl && this.lightboxEl.style.display !== "none";
	}

	private showImageLightbox(imageUrl: string, alt: string) {
		if (!this.lightboxEl) return;
		if (this.lightboxFadeTimer !== null) {
			window.clearTimeout(this.lightboxFadeTimer);
			this.lightboxFadeTimer = null;
		}

		this.lightboxEl.empty();
		this.lightboxEl.removeClass("is-hiding");

		const img = this.lightboxEl.createEl("img", {
			cls: "timeline-lightbox-img",
			attr: { src: imageUrl, alt },
		});

		let hasEnteredImage = false;
		img.onmouseenter = () => {
			hasEnteredImage = true;
			this.cancelHideTooltip();
		};
		img.onmouseleave = () => {
			this.hideImageLightbox();
		};

		this.lightboxEl.onmousemove = (e: MouseEvent) => {
			const rect = img.getBoundingClientRect();
			const inside =
				e.clientX >= rect.left &&
				e.clientX <= rect.right &&
				e.clientY >= rect.top &&
				e.clientY <= rect.bottom;
			if (inside) {
				hasEnteredImage = true;
			} else if (hasEnteredImage) {
				this.hideImageLightbox();
			} else if (this.tooltipEl) {
				// Also close if the cursor left the thumbnail without moving into the lightbox image
				const activeTip =
					this.subTooltipEl && this.subTooltipEl.style.display !== "none"
						? this.subTooltipEl
						: this.tooltipEl;
				const tipRect = activeTip.getBoundingClientRect();
				const insideTip =
					e.clientX >= tipRect.left &&
					e.clientX <= tipRect.right &&
					e.clientY >= tipRect.top &&
					e.clientY <= tipRect.bottom;
				if (!insideTip) {
					this.hideImageLightbox();
				}
			}
		};

		this.lightboxEl.onclick = () => {
			this.hideImageLightbox();
		};

		this.lightboxEl.style.display = "flex";
	}

	private hideImageLightbox() {
		if (!this.lightboxEl || this.lightboxEl.style.display === "none") return;
		if (this.lightboxFadeTimer !== null) return;

		this.lightboxEl.addClass("is-hiding");
		this.lightboxFadeTimer = window.setTimeout(() => {
			this.lightboxFadeTimer = null;
			if (this.lightboxEl) {
				this.lightboxEl.removeClass("is-hiding");
				this.lightboxEl.style.display = "none";
				this.lightboxEl.empty();
			}
		}, 120);

		if (
			!this.tooltipEl?.matches(":hover") &&
			!this.subTooltipEl?.matches(":hover") &&
			!this.containerEl.querySelector(".timeline-event-item:hover, .timeline-cluster-dot:hover")
		) {
			this.scheduleHideTooltip();
		}
	}

	private cancelHideTooltip() {
		if (this.tooltipHideTimer !== null) {
			window.clearTimeout(this.tooltipHideTimer);
			this.tooltipHideTimer = null;
		}
		if (this.tooltipFadeTimer !== null) {
			window.clearTimeout(this.tooltipFadeTimer);
			this.tooltipFadeTimer = null;
		}
		if (this.tooltipEl) {
			this.tooltipEl.removeClass("is-hiding");
		}
	}

	private scheduleHideTooltip(delayMs: number = 220) {
		this.cancelHideTooltip();
		this.tooltipHideTimer = window.setTimeout(() => {
			this.tooltipHideTimer = null;
			this.hideTooltip();
		}, delayMs);
	}

	private hideTooltip() {
		this.hideSubTooltip();
		if (this.tooltipHideTimer !== null) {
			window.clearTimeout(this.tooltipHideTimer);
			this.tooltipHideTimer = null;
		}
		if (!this.tooltipEl || this.tooltipEl.style.display === "none") return;

		this.tooltipEl.addClass("is-hiding");
		this.tooltipFadeTimer = window.setTimeout(() => {
			this.tooltipFadeTimer = null;
			if (this.tooltipEl) {
				this.tooltipEl.removeClass("is-hiding");
				this.tooltipEl.style.display = "none";
			}
		}, 120);
	}

	private setupInteractionHandlers(scrollWrapper: HTMLElement) {
		// Drag to Pan with "Heavy" Momentum Physics
		scrollWrapper.onmousedown = (e) => {
			this.containerEl.focus({ preventScroll: true });
			if (this.animFrameId) {
				cancelAnimationFrame(this.animFrameId);
				this.animFrameId = null;
			}
			if (
				(e.target as HTMLElement).closest(".timeline-event-item") ||
				(e.target as HTMLElement).closest(".timeline-cluster-dot")
			) {
				return;
			}
			this.hideTooltip();
			this.isDragging = true;
			scrollWrapper.addClass("is-dragging");
			this.startX = e.pageX - scrollWrapper.offsetLeft;
			this.scrollLeft = scrollWrapper.scrollLeft;
			this.lastMouseX = e.pageX;
			this.lastMouseTime = performance.now();
			this.panVelocity = 0;
		};

		if (this.onWindowMouseUp) {
			window.removeEventListener("mouseup", this.onWindowMouseUp);
		}
		this.onWindowMouseUp = () => {
			this.isDraggingCategoryPills = false;
			if (this.isDragging) {
				this.isDragging = false;
				scrollWrapper.removeClass("is-dragging");

				// Coast with satisfying "heavy" deceleration when released
				if (Math.abs(this.panVelocity) > 0.05) {
					let vx = this.panVelocity * 16;
					vx = Math.max(-55, Math.min(55, vx));

					const friction = 0.94;
					const glide = () => {
						if (Math.abs(vx) < 0.25 || !this.scrollWrapperEl) {
							this.animFrameId = null;
							return;
						}
						this.scrollWrapperEl.scrollLeft -= vx;
						vx *= friction;
						this.animFrameId = requestAnimationFrame(glide);
					};
					this.animFrameId = requestAnimationFrame(glide);
				}
			}
		};
		window.addEventListener("mouseup", this.onWindowMouseUp);

		scrollWrapper.onmousemove = (e) => {
			const rect = scrollWrapper.getBoundingClientRect();
			this.lastCursorScreenX = e.clientX - rect.left;
			this.updateRulerCursorPosition();

			if (!this.isDragging) return;
			e.preventDefault();

			const now = performance.now();
			const dt = now - this.lastMouseTime;
			if (dt > 0) {
				const dx = e.pageX - this.lastMouseX;
				const currentV = dx / dt;
				this.panVelocity = this.panVelocity * 0.4 + currentV * 0.6;
			}
			this.lastMouseX = e.pageX;
			this.lastMouseTime = now;

			const x = e.pageX - scrollWrapper.offsetLeft;
			const walk = (x - this.startX) * 1.3;
			scrollWrapper.scrollLeft = this.scrollLeft - walk;
			this.updateRulerCursorPosition();
		};

		scrollWrapper.onmouseleave = () => {
			this.lastCursorScreenX = null;
			if (this.rulerCursorEl) {
				this.rulerCursorEl.removeClass("is-visible");
			}
		};

		scrollWrapper.addEventListener(
			"scroll",
			() => {
				this.renderVisibleRulerDays(false);
				this.updateRulerCursorPosition();
			},
			{ passive: true }
		);

		// MOUSE WHEEL & CURSOR-PINNED ZOOM HANDLING (coalesced to animation frames)
		scrollWrapper.addEventListener(
			"wheel",
			(e: WheelEvent) => {
				e.preventDefault();

				// If holding Shift -> move sideways (zoom-aware: slower when zoomed out for precision)
				if (e.shiftKey) {
					const panScale = Math.max(0.1, Math.min(1.0, this.pixelsPerDay / 30));
					scrollWrapper.scrollLeft += (e.deltaY || e.deltaX) * 1.4 * panScale;
					return;
				}

				// If natural trackpad horizontal delta -> scroll sideways (zoom-aware)
				if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
					const panScale = Math.max(0.1, Math.min(1.0, this.pixelsPerDay / 30));
					scrollWrapper.scrollLeft += e.deltaX * panScale;
					return;
				}

				// Measure exact position of cursor relative to visible scroll container
				const rect = scrollWrapper.getBoundingClientRect();
				const cursorScreenX = e.clientX - rect.left;
				const basePx = this.pendingZoom ? this.pendingZoom.newPx : this.pixelsPerDay;
				const targetDay = this.pendingZoom
					? this.pendingZoom.targetDay
					: (scrollWrapper.scrollLeft + cursorScreenX) / this.pixelsPerDay;

				// Handle delta smoothly with configurable sensitivity and velocity acceleration
				const delta = e.deltaY;
				if (delta === 0) return;

				const now = performance.now();
				const dt = now - this.lastWheelZoomTime;
				this.lastWheelZoomTime = now;

				if (this.settings.zoomAcceleration ?? true) {
					if (dt < 140) {
						const speedBoost = Math.min(1.2, (140 - dt) / 90);
						this.wheelZoomBurst = Math.min(3.2, this.wheelZoomBurst * 0.75 + speedBoost);
					} else {
						this.wheelZoomBurst = 0;
					}
				} else {
					this.wheelZoomBurst = 1.0;
				}

				const sensitivity = this.settings.zoomSensitivity ?? 1.0;
				// Base step for a single deliberate notch is gentle (~5%); fast spinning ramps up to ~20%
				const accelMultiplier = (this.settings.zoomAcceleration ?? true)
					? 0.55 + this.wheelZoomBurst * 0.75
					: 1.0;
				const rawIntensity = Math.min(1.5, Math.abs(delta) / 100);
				const stepFraction = Math.max(0.015, Math.min(0.35, 0.085 * rawIntensity * sensitivity * accelMultiplier));

				let newZoom: number;
				if (delta < 0) {
					// Zooming in (multiplicative so it works below 1 px/day)
					newZoom = basePx * (1 + stepFraction);
				} else {
					// Zooming out (multiplicative so it works below 1 px/day)
					newZoom = basePx / (1 + stepFraction);
				}

				// Ctrl held = deep zoom out past the normal 1 px/day floor
				// If user is at or above 1 px/day and tries to go below 1 without Ctrl, clamp at 1
				// If user is already below 1 px/day (extended mode), allow free zooming
				const currentlyAtOrAboveOne = this.pixelsPerDay >= 1;
				const willGoBelowOne = newZoom < 1;

				// Don't zoom out past the timeline length
				const viewWidth = this.scrollWrapperEl?.clientWidth || 1200;
				const minZoomToFit = this.totalDays > 0 ? viewWidth / this.totalDays : 0.1;
				const minZoom = Math.max(0.1, minZoomToFit);

				if (delta > 0 && willGoBelowOne && currentlyAtOrAboveOne && !e.ctrlKey) {
					newZoom = 1; // Clamp at 1 px/day floor
					if (minZoom < 1) {
						this.showZoomHint();
					}
				} else {
					this.hideZoomHint();
				}

				newZoom = Math.max(minZoom, Math.min(140, newZoom));
				this.pendingZoom = { newPx: newZoom, cursorScreenX, targetDay };

				if (this.zoomRafId === null) {
					this.zoomRafId = requestAnimationFrame(() => {
						this.zoomRafId = null;
						if (this.pendingZoom) {
							const { newPx, cursorScreenX: cx, targetDay: td } = this.pendingZoom;
							this.pendingZoom = null;
							this.applyZoom(newPx, cx, td);
						}
					});
				}
			},
			{ passive: false }
		);

		this.containerEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLSelectElement ||
				e.target instanceof HTMLTextAreaElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable) ||
				e.ctrlKey ||
				e.metaKey ||
				e.altKey
			) {
				return;
			}
			const hasCustomHotkey = (cmdId: string) => {
				const fullId = `obsidian-timeline:${cmdId}`;
				const custom = (this.app as any).hotkeyManager?.customKeys?.[fullId];
				return Array.isArray(custom) && custom.length > 0;
			};

			if (e.key === "Home" && !hasCustomHotkey("reset-default-view")) {
				e.preventDefault();
				this.resetToDefaultView(true);
			} else if (e.key === "ArrowLeft" && !e.shiftKey && !hasCustomHotkey("pan-left")) {
				e.preventDefault();
				this.panByViewportFraction(-0.15);
			} else if (e.key === "ArrowRight" && !e.shiftKey && !hasCustomHotkey("pan-right")) {
				e.preventDefault();
				this.panByViewportFraction(0.15);
			} else if (
				((e.key === "ArrowLeft" && e.shiftKey) || e.key === "PageUp") &&
				!hasCustomHotkey("jump-prev-month")
			) {
				e.preventDefault();
				this.panByDays(-30);
			} else if (
				((e.key === "ArrowRight" && e.shiftKey) || e.key === "PageDown") &&
				!hasCustomHotkey("jump-next-month")
			) {
				e.preventDefault();
				this.panByDays(30);
			} else if ((e.key === "+" || e.key === "=") && !hasCustomHotkey("zoom-in")) {
				e.preventDefault();
				this.stepZoomIn();
			} else if ((e.key === "-" || e.key === "_") && !hasCustomHotkey("zoom-out")) {
				e.preventDefault();
				this.stepZoomOut();
			} else if ((e.key === "0" || e.key === "z" || e.key === "Z") && !hasCustomHotkey("zoom-to-fit-all")) {
				e.preventDefault();
				this.zoomToFitAll();
			} else if ((e.key === "l" || e.key === "L") && !hasCustomHotkey("cycle-label-mode")) {
				e.preventDefault();
				this.cycleLabelMode();
			} else if (e.key === "/") {
				e.preventDefault();
				this.searchInputEl?.focus();
				this.searchInputEl?.select();
			}
		});
	}

	public stepZoomIn() {
		this.hideZoomHint();
		const nextZoom = this.pixelsPerDay < 10 ? this.pixelsPerDay * 1.25 : this.pixelsPerDay + 8;
		this.applyZoom(nextZoom);
	}

	public stepZoomOut() {
		const viewWidth = this.scrollWrapperEl?.clientWidth || 1200;
		const minZoomToFit = this.totalDays > 0 ? viewWidth / this.totalDays : 0.1;
		const minZoom = Math.max(0.1, minZoomToFit);
		let nextZoom = this.pixelsPerDay < 10 ? this.pixelsPerDay / 1.25 : this.pixelsPerDay - 6;
		if (this.pixelsPerDay >= 1 && nextZoom < 1) {
			nextZoom = 1;
			if (minZoom < 1) {
				this.showZoomHint();
			}
		}
		this.applyZoom(nextZoom);
	}

	public panByViewportFraction(fraction: number) {
		if (!this.scrollWrapperEl) return;
		const sign = fraction < 0 ? -1 : 1;
		const stepDays = Math.max(
			1,
			Math.round((this.scrollWrapperEl.clientWidth * Math.abs(fraction)) / this.pixelsPerDay)
		);
		this.panByDays(sign * stepDays);
	}

	public cycleLabelMode() {
		const order: ("auto" | "vertical" | "horizontal" | "hidden")[] = [
			"auto",
			"vertical",
			"horizontal",
			"hidden",
		];
		const idx = order.indexOf(this.settings.labelMode);
		this.settings.labelMode = order[(idx + 1) % order.length];
		this.onSettingsChange();
		this.updateToolbar();
		this.renderTrack();
	}

	public zoomToFitAll() {
		if (!this.scrollWrapperEl) return;
		const filtered = this.getFilteredEvents();
		const viewWidth = this.scrollWrapperEl.clientWidth || 1200;
		const dayMs = 86400000;

		if (filtered.length > 0) {
			let minTs = filtered[0].startTimestamp;
			let maxTs = filtered[0].endTimestamp;
			for (const ev of filtered) {
				if (ev.startTimestamp < minTs) minTs = ev.startTimestamp;
				if (ev.endTimestamp > maxTs) maxTs = ev.endTimestamp;
			}
			const spanDays = Math.max(30, (maxTs - minTs) / dayMs + 30);
			const minZoomToFit = this.totalDays > 0 ? viewWidth / this.totalDays : 0.1;
			const minZoom = Math.max(0.1, minZoomToFit);
			const targetPx = Math.max(minZoom, Math.min(140, Math.floor(viewWidth / spanDays)));
			const centerDay = ((minTs + maxTs) / 2 - this.minTimestamp) / dayMs;

			this.pixelsPerDay = targetPx;
			this.settings.zoomPixelsPerDay = targetPx;
			this.onSettingsChange();
			this.renderTrack();

			const targetScrollLeft = Math.max(0, Math.round(centerDay * targetPx - viewWidth / 2));
			this.scrollWrapperEl.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
			this.renderVisibleRulerDays(true);
		} else {
			this.applyZoom(1);
			this.scrollToToday(true);
		}

		this.hideZoomHint();
	}

	public resetToDefaultView(smooth: boolean = true) {
		const targetPx = this.computeDefaultZoomPixelsPerDay();
		if (targetPx !== this.pixelsPerDay) {
			this.pixelsPerDay = targetPx;
			this.settings.zoomPixelsPerDay = targetPx;
			this.onSettingsChange();
			this.renderTrack();
		}
		this.scrollToDefaultView(smooth);
	}

	public scrollToDefaultView(smooth: boolean = false) {
		const offsetDays = parseDurationToDays(this.settings.defaultViewOffset, 0);
		this.scrollToToday(smooth, offsetDays);
	}

	public scrollToToday(smooth: boolean = true, offsetDaysFromToday: number = 0) {
		if (!this.scrollWrapperEl) return;
		const now = new Date();
		const todayTimestamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		const dayMs = 86400000;
		const offsetDays = (todayTimestamp - this.minTimestamp) / dayMs + offsetDaysFromToday;

		const targetX = (offsetDays + 0.5) * this.pixelsPerDay - this.scrollWrapperEl.clientWidth / 2;
		this.scrollWrapperEl.scrollTo({
			left: Math.max(0, targetX),
			behavior: smooth ? "smooth" : "auto",
		});
		this.renderVisibleRulerDays(true);
	}

	public panByDays(days: number) {
		if (!this.scrollWrapperEl) return;
		this.scrollWrapperEl.scrollBy({
			left: days * this.pixelsPerDay,
			behavior: "smooth",
		});
	}

	private updateRulerCursorPosition() {
		if (!this.rulerCursorEl || !this.scrollWrapperEl) {
			return;
		}
		if (
			!(this.settings.showRulerCursor ?? true) ||
			this.lastCursorScreenX === null ||
			this.pixelsPerDay < 30
		) {
			this.rulerCursorEl.removeClass("is-visible");
			return;
		}
		const trackX = this.scrollWrapperEl.scrollLeft + this.lastCursorScreenX;
		this.rulerCursorEl.style.transform = `translateX(${trackX}px)`;
		this.rulerCursorEl.addClass("is-visible");
	}

	private showZoomHint() {
		if (!this.zoomHintEl) return;
		this.zoomHintEl.classList.add("is-visible");
		if (this.zoomHintHideTimer) {
			window.clearTimeout(this.zoomHintHideTimer);
		}
		this.zoomHintHideTimer = window.setTimeout(() => {
			this.zoomHintEl?.classList.remove("is-visible");
			this.zoomHintHideTimer = null;
		}, 3000);
	}

	private hideZoomHint() {
		if (!this.zoomHintEl) return;
		this.zoomHintEl.classList.remove("is-visible");
		if (this.zoomHintHideTimer) {
			window.clearTimeout(this.zoomHintHideTimer);
			this.zoomHintHideTimer = null;
		}
	}

	public destroy() {
		this.cancelHideTooltip();
		if (this.lightboxFadeTimer !== null) {
			window.clearTimeout(this.lightboxFadeTimer);
			this.lightboxFadeTimer = null;
		}
		if (this.onWindowKeyDown) {
			window.removeEventListener("keydown", this.onWindowKeyDown, true);
			this.onWindowKeyDown = null;
		}
		if (this.onWindowMouseUp) {
			window.removeEventListener("mouseup", this.onWindowMouseUp);
			this.onWindowMouseUp = null;
		}
		if (this.zoomRafId !== null) {
			cancelAnimationFrame(this.zoomRafId);
			this.zoomRafId = null;
		}
		if (this.animFrameId) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
		if (this.tooltipEl && this.tooltipEl.parentNode) {
			this.tooltipEl.parentNode.removeChild(this.tooltipEl);
		}
		if (this.subTooltipEl && this.subTooltipEl.parentNode) {
			this.subTooltipEl.parentNode.removeChild(this.subTooltipEl);
		}
		if (this.lightboxEl && this.lightboxEl.parentNode) {
			this.lightboxEl.parentNode.removeChild(this.lightboxEl);
		}
	}
}
