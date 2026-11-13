import { App, Menu, TFile } from "obsidian";
import { TimelineEvent, TimelineSettings } from "../types";

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
	private zoomSliderEl: HTMLInputElement | null = null;
	private tooltipEl: HTMLElement | null = null;
	private isInitialRender: boolean = true;
	private wasDaysRowCollapsed: boolean | null = null;

	// Dragging & Momentum Physics state
	private isDragging: boolean = false;
	private startX: number = 0;
	private scrollLeft: number = 0;
	private animFrameId: number | null = null;
	private lastMouseX: number = 0;
	private lastMouseTime: number = 0;
	private panVelocity: number = 0;

	// Active filter state
	private activeHiddenCategoryIds: Set<string>;

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
		this.pixelsPerDay = settings.zoomPixelsPerDay || 40;
		this.render();
	}

	public render() {
		this.containerEl.addClass("obsidian-timeline-wrapper");

		// Initialize persistent DOM structure once
		if (!this.toolbarEl || !this.scrollWrapperEl || !this.timelineTrackEl) {
			this.containerEl.empty();
			this.toolbarEl = this.containerEl.createDiv({ cls: "timeline-toolbar" });
			this.scrollWrapperEl = this.containerEl.createDiv({ cls: "timeline-scroll-wrapper" });
			this.timelineTrackEl = this.scrollWrapperEl.createDiv({ cls: "timeline-track" });

			this.setupInteractionHandlers(this.scrollWrapperEl);
			this.setupTooltip();
		}

		// Update toolbar buttons, categories, and sliders
		this.updateToolbar();

		// Calculate bounds
		const filteredEvents = this.getFilteredEvents();
		this.calculateBounds(filteredEvents);

		// Render track contents
		this.renderTrack();

		if (this.isInitialRender) {
			this.isInitialRender = false;
			setTimeout(() => {
				this.scrollToToday(false);
			}, 50);
		}
	}

	private getFilteredEvents(): TimelineEvent[] {
		return this.events.filter((e) => {
			if (e.categoryId && this.activeHiddenCategoryIds.has(e.categoryId)) {
				return false;
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
			text: "◀◀ Year",
			cls: "timeline-btn",
			title: "Jump back 1 year",
		});
		prevYearBtn.onclick = () => this.panByDays(-365);

		const prevMonthBtn = leftGroup.createEl("button", {
			text: "◀ Month",
			cls: "timeline-btn",
		});
		prevMonthBtn.onclick = () => this.panByDays(-30);

		const nextMonthBtn = leftGroup.createEl("button", {
			text: "Month ▶",
			cls: "timeline-btn",
		});
		nextMonthBtn.onclick = () => this.panByDays(30);

		const nextYearBtn = leftGroup.createEl("button", {
			text: "Year ▶▶",
			cls: "timeline-btn",
			title: "Jump forward 1 year",
		});
		nextYearBtn.onclick = () => this.panByDays(365);

		// Middle: Category Filter Pills
		const filterGroup = this.toolbarEl.createDiv({ cls: "timeline-toolbar-group timeline-categories-group" });
		for (const cat of this.settings.categories) {
			const isHidden = this.activeHiddenCategoryIds.has(cat.id);
			const pill = filterGroup.createDiv({
				cls: `timeline-category-pill ${isHidden ? "is-hidden" : ""}`,
			});

			const dot = pill.createSpan({ cls: "category-dot" });
			dot.style.backgroundColor = cat.color;

			pill.createSpan({ text: cat.name, cls: "category-name" });

			pill.onclick = () => {
				if (this.activeHiddenCategoryIds.has(cat.id)) {
					this.activeHiddenCategoryIds.delete(cat.id);
				} else {
					this.activeHiddenCategoryIds.add(cat.id);
				}
				this.settings.hiddenCategoryIds = Array.from(this.activeHiddenCategoryIds);
				this.onSettingsChange();
				this.renderTrack();
				this.updateToolbar();
			};
		}

		// Right: Zoom & Label Controls
		const rightGroup = this.toolbarEl.createDiv({ cls: "timeline-toolbar-group" });

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

		// Zoom Out Button
		const zoomOutBtn = rightGroup.createEl("button", {
			text: "－",
			cls: "timeline-btn timeline-btn-icon",
			title: "Zoom Out",
		});
		zoomOutBtn.onclick = () => {
			const nextZoom = this.pixelsPerDay < 10 ? this.pixelsPerDay - 1 : this.pixelsPerDay - 6;
			this.applyZoom(nextZoom);
		};

		// Zoom Slider (supports all the way down to 1px/day for multi-year view!)
		this.zoomSliderEl = rightGroup.createEl("input", {
			type: "range",
			cls: "timeline-zoom-slider",
		});
		this.zoomSliderEl.min = "1";
		this.zoomSliderEl.max = "140";
		this.zoomSliderEl.value = String(this.pixelsPerDay);
		this.zoomSliderEl.oninput = (e) => {
			this.applyZoom(parseInt((e.target as HTMLInputElement).value, 10));
		};

		// Zoom In Button
		const zoomInBtn = rightGroup.createEl("button", {
			text: "＋",
			cls: "timeline-btn timeline-btn-icon",
			title: "Zoom In",
		});
		zoomInBtn.onclick = () => {
			const nextZoom = this.pixelsPerDay < 10 ? this.pixelsPerDay + 2 : this.pixelsPerDay + 8;
			this.applyZoom(nextZoom);
		};
	}

	public applyZoom(newPx: number, cursorScreenX?: number, targetDay?: number) {
		const clamped = Math.max(1, Math.min(140, newPx));
		if (clamped === this.pixelsPerDay) return;

		if (!this.scrollWrapperEl) return;

		if (cursorScreenX === undefined || targetDay === undefined) {
			cursorScreenX = this.scrollWrapperEl.clientWidth / 2;
			const cursorTrackX = this.scrollWrapperEl.scrollLeft + cursorScreenX;
			targetDay = cursorTrackX / this.pixelsPerDay;
		}

		this.pixelsPerDay = clamped;
		this.settings.zoomPixelsPerDay = clamped;
		this.onSettingsChange();

		if (this.zoomSliderEl) {
			this.zoomSliderEl.value = String(clamped);
		}

		// Re-render ONLY track contents without destroying outer containers
		this.renderTrack();

		// Keep the target day locked under the cursor
		const targetScrollLeft = Math.max(0, Math.round(targetDay * clamped - cursorScreenX));
		this.scrollWrapperEl.scrollLeft = targetScrollLeft;

		requestAnimationFrame(() => {
			if (this.scrollWrapperEl) {
				this.scrollWrapperEl.scrollLeft = targetScrollLeft;
			}
		});
	}

	private renderTrack() {
		if (!this.timelineTrackEl || !this.scrollWrapperEl) return;

		this.timelineTrackEl.empty();
		const minWidth = this.scrollWrapperEl.clientWidth || 900;
		const trackWidth = Math.max(minWidth, this.totalDays * this.pixelsPerDay);
		this.timelineTrackEl.style.width = `${trackWidth}px`;

		const filteredEvents = this.getFilteredEvents();

		// 1. Render Ruler (Year / Month / Day hierarchy)
		this.renderRuler(this.timelineTrackEl);

		// 2. Render Today Indicator
		if (this.settings.showToday) {
			this.renderTodayMarker(this.timelineTrackEl);
		}

		// 3. Render Central Line, Events, and Merged Clusters
		this.renderTimelineLineAndEvents(this.timelineTrackEl, filteredEvents);
	}

	private renderRuler(trackEl: HTMLElement) {
		const isCollapsed = this.pixelsPerDay < 30;
		const prevCollapsed = this.wasDaysRowCollapsed;
		this.wasDaysRowCollapsed = isCollapsed;

		const rulerEl = trackEl.createDiv({
			cls: `timeline-ruler ${prevCollapsed ?? isCollapsed ? "is-days-hidden" : ""}`,
		});
		const monthsRow = rulerEl.createDiv({ cls: "timeline-ruler-months" });
		const daysRow = rulerEl.createDiv({
			cls: `timeline-ruler-days ${prevCollapsed ?? isCollapsed ? "is-collapsed" : ""}`,
		});
		if (prevCollapsed !== null && prevCollapsed !== isCollapsed) {
			requestAnimationFrame(() => {
				rulerEl.toggleClass("is-days-hidden", isCollapsed);
				daysRow.toggleClass("is-collapsed", isCollapsed);
			});
		}

		const dayMs = 86400000;
		const monthNamesFull = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		const monthNamesShort = [
			"Jan", "Feb", "Mar", "Apr", "May", "Jun",
			"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
		];
		const monthLetters = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
		const weekdayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

		let currentMonth = -1;
		let currentMonthYear = -1;
		let currentMonthStartDay = 0;
		let currentMonthDaysCount = 0;

		const flushMonth = () => {
			if (currentMonth !== -1 && currentMonthDaysCount > 0) {
				const mEl = monthsRow.createDiv({ cls: "timeline-month-block" });
				mEl.style.left = `${currentMonthStartDay * this.pixelsPerDay}px`;
				mEl.style.width = `${currentMonthDaysCount * this.pixelsPerDay}px`;

				// Adaptive month header depending on zoom
				let labelText = "";
				if (this.pixelsPerDay >= 35) {
					labelText = `${monthNamesFull[currentMonth]} ${currentMonthYear}`;
				} else if (this.pixelsPerDay >= 12) {
					labelText = `${monthNamesShort[currentMonth]} '${String(currentMonthYear).slice(2)}`;
				} else if (this.pixelsPerDay >= 5) {
					labelText = currentMonth === 0 ? String(currentMonthYear) : monthNamesShort[currentMonth];
				} else {
					// Ultra-zoomed out (< 5px/day): only show Year labels at the start of each year
					labelText = currentMonth === 0 ? String(currentMonthYear) : "";
				}

				if (labelText) {
					mEl.createSpan({
						text: labelText,
						cls: "timeline-month-label",
					});
				}
			}
		};

		for (let i = 0; i < this.totalDays; i++) {
			const date = new Date(this.minTimestamp + i * dayMs);
			const month = date.getUTCMonth();
			const year = date.getUTCFullYear();
			const dayOfMonth = date.getUTCDate();
			const dayOfWeek = date.getUTCDay();

			if (month !== currentMonth || year !== currentMonthYear) {
				flushMonth();
				currentMonth = month;
				currentMonthYear = year;
				currentMonthStartDay = i;
				currentMonthDaysCount = 1;
			} else {
				currentMonthDaysCount++;
			}

			// Render day / week tick only when zoom level provides enough room (same 30px/day threshold as labels)
			if (this.pixelsPerDay >= 30) {
				const dayEl = daysRow.createDiv({
					cls: `timeline-day-tick ${dayOfWeek === 0 || dayOfWeek === 6 ? "is-weekend" : ""}`,
				});
				dayEl.style.left = `${i * this.pixelsPerDay}px`;
				dayEl.style.width = `${this.pixelsPerDay}px`;

				dayEl.createDiv({ text: String(dayOfMonth), cls: "day-number" });
				if (this.pixelsPerDay >= 46) {
					dayEl.createDiv({ text: weekdayNames[dayOfWeek], cls: "day-name" });
				}
			}

			// Grid lines
			if (this.settings.showGrid) {
				if (dayOfWeek === 1 && this.pixelsPerDay >= 15) {
					const gridLine = trackEl.createDiv({ cls: "timeline-grid-line is-week-start" });
					gridLine.style.left = `${i * this.pixelsPerDay}px`;
				} else if (dayOfMonth === 1 && this.pixelsPerDay < 15) {
					const gridLine = trackEl.createDiv({ cls: "timeline-grid-line is-month-start" });
					gridLine.style.left = `${i * this.pixelsPerDay}px`;
				}
			}
		}

		flushMonth();
	}

	private renderTodayMarker(trackEl: HTMLElement) {
		const now = new Date();
		const todayTimestamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		const dayMs = 86400000;
		const offsetDays = (todayTimestamp - this.minTimestamp) / dayMs;

		if (offsetDays >= 0 && offsetDays <= this.totalDays) {
			const todayMarker = trackEl.createDiv({ cls: "timeline-today-marker" });
			const x = offsetDays * this.pixelsPerDay + this.pixelsPerDay / 2;
			todayMarker.style.left = `${x}px`;

			todayMarker.createDiv({ cls: "timeline-today-badge", text: "TODAY" });
			todayMarker.createDiv({ cls: "timeline-today-line" });
		}
	}

	private renderTimelineLineAndEvents(trackEl: HTMLElement, events: TimelineEvent[]) {
		const stageEl = trackEl.createDiv({ cls: "timeline-stage" });

		// The Single Central Continuous Axis Line
		stageEl.createDiv({ cls: "timeline-central-axis" });

		// Day tick marks on the axis (shown when pixelsPerDay >= 30, same threshold as auto text labels)
		if (this.pixelsPerDay >= 30) {
			for (let i = 0; i < this.totalDays; i++) {
				const tick = stageEl.createDiv({ cls: "timeline-day-tick-mark" });
				tick.style.left = `${Math.round(i * this.pixelsPerDay + this.pixelsPerDay / 2)}px`;
				// Taller ticks once labels go horizontal (65+ px/day) so events are easier to align to days
				if (this.pixelsPerDay >= 65) tick.style.height = "24px";
			}
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

		// Multi-day bar thickness scales down smoothly as user zooms out
		let barHeightPx = 18;
		let showTextInBar = false;
		if (this.pixelsPerDay >= 55) {
			barHeightPx = 18;
			showTextInBar = true;
		} else if (this.pixelsPerDay >= 30) {
			barHeightPx = 8;
			showTextInBar = false;
		} else {
			barHeightPx = 4;
			showTextInBar = false;
		}

		const dayMs = 86400000;

		// CLUSTERING ALGORITHM:
		// When events are within clusterDistancePx of each other, group them into a Merged Dot!
		const clusterDistancePx = 22;
		const clusters: TimelineCluster[] = [];

		for (const ev of events) {
			const startOffsetDays = (ev.startTimestamp - this.minTimestamp) / dayMs;
			const startX = startOffsetDays * this.pixelsPerDay;
			const centerX = startX + (ev.isRange ? 0 : this.pixelsPerDay / 2);

			if (clusters.length > 0) {
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
					this.showClusterTooltip(cluster, e);
				};
				clusterEl.onmouseleave = () => {
					this.hideTooltip();
				};

				// Click: smoothly zoom in directly centered on this cluster!
				clusterEl.onclick = (e) => {
					e.stopPropagation();
					if (this.scrollWrapperEl) {
						const rect = this.scrollWrapperEl.getBoundingClientRect();
						const cursorScreenX = cluster.startX - this.scrollWrapperEl.scrollLeft;
						const targetDay = cluster.startX / this.pixelsPerDay;
						const nextZoom = Math.min(140, Math.round(this.pixelsPerDay * 2.2));
						this.applyZoom(nextZoom, cursorScreenX, targetDay);
					}
				};

				continue;
			}

			// CASE 2: SINGLE EVENT (NOT MERGED)
			const ev = cluster.events[0];
			const startOffsetDays = (ev.startTimestamp - this.minTimestamp) / dayMs;
			const startX = startOffsetDays * this.pixelsPerDay;
			const centerX = startX + (ev.isRange ? 0 : this.pixelsPerDay / 2);

			let widthPx = this.pixelsPerDay;
			if (ev.isRange) {
				const durationDays = Math.max(1, Math.round((ev.endTimestamp - ev.startTimestamp) / dayMs));
				widthPx = durationDays * this.pixelsPerDay;
			}

			// EVENT CONTAINER
			const eventEl = stageEl.createDiv({
				cls: `timeline-event-item ${ev.isRange ? "is-range" : "is-point"}`,
			});
			eventEl.style.setProperty("--event-color", ev.color);

			// 1. MARKER ON CENTRAL AXIS
			if (ev.isRange) {
				// Multi-day Bar directly on the line
				eventEl.style.left = `${startX}px`;
				eventEl.style.width = `${widthPx}px`;

				const bar = eventEl.createDiv({ cls: "timeline-event-bar" });
				bar.style.height = `${barHeightPx}px`;
				bar.style.backgroundColor = ev.color;
				bar.style.boxShadow = `0 0 6px ${ev.color}55`;

				if (showTextInBar && widthPx > 50 && effectiveLabelMode !== "hidden") {
					bar.createSpan({ text: ev.title, cls: "event-bar-label" });
				}
			} else {
				// Single-day Dot directly on the line
				eventEl.style.left = `${centerX}px`;

				const dot = eventEl.createDiv({ cls: "timeline-event-dot" });
				dot.style.backgroundColor = ev.color;
				dot.style.boxShadow = `0 0 8px ${ev.color}99`;
			}

			// 2. STEM & LABEL IF NOT HIDDEN
			const needsStemLabel =
				effectiveLabelMode !== "hidden" &&
				(!ev.isRange || !showTextInBar || widthPx <= 50);

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
					cls: `timeline-event-label pos-${chosenSide} mode-${effectiveLabelMode}`,
				});
				label.style.left = ev.isRange ? `${Math.min(20, widthPx / 2)}px` : "0px";
				if (chosenSide === "above") {
					label.style.bottom = `calc(50% + ${stemHeight}px)`;
				} else {
					label.style.top = `calc(50% + ${stemHeight}px)`;
				}

				label.setText(ev.title);
				label.style.borderLeftColor = ev.color;
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
				this.hideTooltip();
			};
		}
	}

	private setupTooltip() {
		if (this.tooltipEl) {
			this.tooltipEl.remove();
		}
		this.tooltipEl = document.createElement("div");
		this.tooltipEl.className = "timeline-floating-tooltip";
		this.tooltipEl.style.display = "none";
		document.body.appendChild(this.tooltipEl);
	}

	private formatDateForDisplay(dateStr: string): string {
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

		const monthName = monthNames[month] || "";
		return `${monthName} ${day}, ${year}`;
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

	private showTooltip(ev: TimelineEvent, mouseEvent: MouseEvent) {
		if (!this.tooltipEl) return;
		this.tooltipEl.empty();

		const titleRow = this.tooltipEl.createDiv({ cls: "tooltip-title" });
		titleRow.createSpan({ text: ev.title });

		const dateRow = this.tooltipEl.createDiv({ cls: "tooltip-date-row" });
		const startFormatted = this.formatDateForDisplay(ev.startDate);
		if (ev.isRange && ev.endDate) {
			const endFormatted = this.formatDateForDisplay(ev.endDate);
			dateRow.setText(`${startFormatted} → ${endFormatted}`);
		} else {
			dateRow.setText(startFormatted);
		}

		// Relative Time Message (e.g. "In 5 days" or "3 years, 2 months ago")
		const relativeTimeStr = this.getRelativeTimeMessage(ev);
		if (relativeTimeStr) {
			this.tooltipEl.createDiv({
				cls: "tooltip-relative-time",
				text: relativeTimeStr,
			});
		}

		if (ev.categoryName) {
			const badge = this.tooltipEl.createSpan({
				cls: "tooltip-category-badge",
				text: ev.categoryName,
			});
			badge.style.backgroundColor = `${ev.color}33`;
			badge.style.borderColor = ev.color;
			badge.style.color = ev.color;
		}

		if (ev.imageUrl) {
			const imgEl = this.tooltipEl.createEl("img", {
				cls: "tooltip-image",
				attr: { src: ev.imageUrl, alt: ev.title },
			});
			imgEl.onload = () => this.positionTooltip(mouseEvent);
		}

		if (ev.description) {
			const descEl = this.tooltipEl.createDiv({ cls: "tooltip-desc" });
			descEl.setText(ev.description);
		}

		this.tooltipEl.style.display = "block";
		this.positionTooltip(mouseEvent);
	}

	private showClusterTooltip(cluster: TimelineCluster, mouseEvent: MouseEvent) {
		if (!this.tooltipEl) return;
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
			const dot = item.createSpan({ cls: "tooltip-item-dot" });
			dot.style.backgroundColor = ev.color;

			item.createSpan({ text: ev.title, cls: "tooltip-item-title" });

			const startFormatted = this.formatDateForDisplay(ev.startDate);
			const dateStr = ev.isRange && ev.endDate 
				? `${startFormatted} → ${this.formatDateForDisplay(ev.endDate)}` 
				: startFormatted;
			item.createSpan({ text: dateStr, cls: "tooltip-item-date" });

			item.onclick = (e) => {
				e.stopPropagation();
				this.app.workspace.getLeaf().openFile(ev.file);
			};
		}

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

	private hideTooltip() {
		if (this.tooltipEl) {
			this.tooltipEl.style.display = "none";
		}
	}

	private setupInteractionHandlers(scrollWrapper: HTMLElement) {
		// Drag to Pan with "Heavy" Momentum Physics
		scrollWrapper.onmousedown = (e) => {
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
			this.isDragging = true;
			scrollWrapper.addClass("is-dragging");
			this.startX = e.pageX - scrollWrapper.offsetLeft;
			this.scrollLeft = scrollWrapper.scrollLeft;
			this.lastMouseX = e.pageX;
			this.lastMouseTime = performance.now();
			this.panVelocity = 0;
		};

		window.onmouseup = () => {
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

		scrollWrapper.onmousemove = (e) => {
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
		};

		// MOUSE WHEEL & CURSOR-PINNED ZOOM HANDLING
		scrollWrapper.addEventListener(
			"wheel",
			(e: WheelEvent) => {
				e.preventDefault();

				// If holding Shift -> move sideways
				if (e.shiftKey) {
					scrollWrapper.scrollLeft += (e.deltaY || e.deltaX) * 1.4;
					return;
				}

				// If natural trackpad horizontal delta -> scroll sideways
				if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
					scrollWrapper.scrollLeft += e.deltaX;
					return;
				}

				// Measure exact position of cursor relative to visible scroll container
				const rect = scrollWrapper.getBoundingClientRect();
				const cursorScreenX = e.clientX - rect.left;
				const cursorTrackX = scrollWrapper.scrollLeft + cursorScreenX;
				const targetDay = cursorTrackX / this.pixelsPerDay;

				// Handle delta smoothly while guaranteeing at least ±1px zoom step to prevent getting trapped at zoom=1
				const delta = e.deltaY;
				let newZoom: number;

				if (delta < 0) {
					// Zooming in
					const factor = Math.abs(delta) < 25 ? 1 - delta * 0.015 : 1.18;
					const calculated = Math.round(this.pixelsPerDay * factor);
					newZoom = Math.max(this.pixelsPerDay + 1, calculated);
				} else if (delta > 0) {
					// Zooming out
					const factor = Math.abs(delta) < 25 ? 1 - delta * 0.015 : 0.84;
					const calculated = Math.round(this.pixelsPerDay * factor);
					newZoom = Math.min(this.pixelsPerDay - 1, calculated);
				} else {
					return;
				}

				newZoom = Math.max(1, Math.min(140, newZoom));
				this.applyZoom(newZoom, cursorScreenX, targetDay);
			},
			{ passive: false }
		);
	}

	public scrollToToday(smooth: boolean = true) {
		if (!this.scrollWrapperEl) return;
		const now = new Date();
		const todayTimestamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		const dayMs = 86400000;
		const offsetDays = (todayTimestamp - this.minTimestamp) / dayMs;

		const targetX = offsetDays * this.pixelsPerDay - this.scrollWrapperEl.clientWidth / 2;
		this.scrollWrapperEl.scrollTo({
			left: Math.max(0, targetX),
			behavior: smooth ? "smooth" : "auto",
		});
	}

	public panByDays(days: number) {
		if (!this.scrollWrapperEl) return;
		this.scrollWrapperEl.scrollBy({
			left: days * this.pixelsPerDay,
			behavior: "smooth",
		});
	}

	public destroy() {
		if (this.animFrameId) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
		if (this.tooltipEl && this.tooltipEl.parentNode) {
			this.tooltipEl.parentNode.removeChild(this.tooltipEl);
		}
	}
}
