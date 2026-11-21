import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import { TimelinePlugin } from "./main";
import {
	CategoryConfig,
	ConditionOperator,
	FilterCondition,
	normalizeCategoryConfig,
} from "./types";

const BUILTIN_PROPERTIES = [
	{ value: "file.tags", label: "Tags" },
	{ value: "file.folder", label: "Folder" },
	{ value: "file.name", label: "File Name" },
	{ value: "file.basename", label: "File Basename" },
	{ value: "file.path", label: "Path" },
	{ value: "file.ext", label: "Extension" },
	{ value: "custom", label: "Custom property" },
];

function getValidOperators(property: string): { value: ConditionOperator; label: string }[] {
	if (property === "file.tags") {
		return [
			{ value: "contains", label: "contains" },
			{ value: "doesNotContain", label: "does not contain" },
			{ value: "is", label: "is" },
			{ value: "isNot", label: "is not" },
			{ value: "exists", label: "exists" },
			{ value: "doesNotExist", label: "does not exist" },
		];
	}
	if (property === "file.folder") {
		return [
			{ value: "is", label: "is" },
			{ value: "isNot", label: "is not" },
			{ value: "contains", label: "contains" },
			{ value: "doesNotContain", label: "does not contain" },
		];
	}
	if (property === "file.name" || property === "file.basename") {
		return [
			{ value: "contains", label: "contains" },
			{ value: "doesNotContain", label: "does not contain" },
			{ value: "is", label: "is" },
			{ value: "isNot", label: "is not" },
			{ value: "startsWith", label: "starts with" },
			{ value: "endsWith", label: "ends with" },
			{ value: "matchesDatePattern", label: "matches date pattern" },
			{ value: "exists", label: "exists" },
			{ value: "doesNotExist", label: "does not exist" },
		];
	}
	return [
		{ value: "is", label: "is" },
		{ value: "isNot", label: "is not" },
		{ value: "contains", label: "contains" },
		{ value: "doesNotContain", label: "does not contain" },
		{ value: "startsWith", label: "starts with" },
		{ value: "endsWith", label: "ends with" },
		{ value: "exists", label: "exists" },
		{ value: "doesNotExist", label: "does not exist" },
	];
}

export class TimelineSettingTab extends PluginSettingTab {
	private plugin: TimelinePlugin;
	private expandedCategories: Set<string> = new Set();

	constructor(app: App, plugin: TimelinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// SECTION: FOLDER & SCOPE
		containerEl.createEl("h3", { text: "Folder & Source Filter" });

		new Setting(containerEl)
			.setName("Target folder")
			.setDesc("Folder containing event notes. Leave blank to scan the entire vault.")
			.addText((text) =>
				text
					.setPlaceholder("Calendar")
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						this.plugin.settings.folder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include subfolders")
			.setDesc("Whether to search inside subfolders of the target folder.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSubfolders)
					.onChange(async (value) => {
						this.plugin.settings.includeSubfolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Global note filter")
			.setDesc("Optional rule set to include or exclude notes before category matching.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "No additional filter")
					.addOption("include", "Only include notes that match all conditions")
					.addOption("exclude", "Exclude notes that match all conditions")
					.setValue(this.plugin.settings.filterMode || "none")
					.onChange(async (value: any) => {
						this.plugin.settings.filterMode = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.filterMode && this.plugin.settings.filterMode !== "none") {
			const globalFilterBox = containerEl.createDiv({ cls: "timeline-conditions-box" });
			this.renderConditionsList(
				globalFilterBox,
				this.plugin.settings.filterConditions,
				() => this.display()
			);
		}

		// SECTION: DATE EXTRACTION
		containerEl.createEl("h3", { text: "Date Extraction" });

		new Setting(containerEl)
			.setName("Start date properties")
			.setDesc(
				"Frontmatter property keys used for the start date (comma separated in priority order). Also falls back to YYYY-MM-DD in note title."
			)
			.addText((text) =>
				text
					.setPlaceholder("date, startDate, start")
					.setValue(this.plugin.settings.startDateProperties.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.startDateProperties = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("End date properties")
			.setDesc(
				"Frontmatter property keys used for multi-day event end dates, or the stop date for recurring events (comma separated in priority order)."
			)
			.addText((text) =>
				text
					.setPlaceholder("date-end, endDate, end")
					.setValue(this.plugin.settings.endDateProperties.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.endDateProperties = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Recurring events future horizon (years)")
			.setDesc(
				"How many years past the current year yearly recurring events are generated on the timeline."
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 20, 1)
					.setValue(this.plugin.settings.recurringYearsFuture ?? 3)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.recurringYearsFuture = value;
						await this.plugin.saveSettings();
					})
			);

		// SECTION: APPEARANCE & DISPLAY
		containerEl.createEl("h3", { text: "Display & Appearance" });

		new Setting(containerEl)
			.setName("Default view zoom (time span)")
			.setDesc(
				"Visible time span when opening the timeline (e.g. 6 months, 6mo, 5 days, 2 weeks, 1 year)."
			)
			.addText((text) =>
				text
					.setPlaceholder("6 months")
					.setValue(this.plugin.settings.defaultViewSpan || "6 months")
					.onChange(async (value) => {
						this.plugin.settings.defaultViewSpan = value.trim() || "6 months";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default view offset from today")
			.setDesc(
				"Shifts the initial view relative to today. 0 centers today; -1 month shifts the view 1 month into the past (moving the today line 1 month to the right); +1 month shifts 1 month into the future."
			)
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(this.plugin.settings.defaultViewOffset ?? "0")
					.onChange(async (value) => {
						this.plugin.settings.defaultViewOffset = value.trim() || "0";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Zoom sensitivity")
			.setDesc(
				"Multiplier for mouse wheel and trackpad zoom speed (lower = finer control, higher = faster zoom)."
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.3, 2.5, 0.1)
					.setValue(this.plugin.settings.zoomSensitivity ?? 1.0)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.zoomSensitivity = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Zoom acceleration")
			.setDesc(
				"Scale zoom speed with wheel velocity so slow notches are precise and fast spins cover ground quickly."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.zoomAcceleration ?? true)
					.onChange(async (value) => {
						this.plugin.settings.zoomAcceleration = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Label display mode")
			.setDesc(
				"Auto switches from hidden (zoomed out) to vertical (medium) to horizontal (zoomed in)."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", "Auto (Adaptive based on zoom)")
					.addOption("vertical", "Always Vertical")
					.addOption("hidden", "Hidden (Popups on hover only)")
					.addOption("horizontal", "Always Horizontal")
					.setValue(this.plugin.settings.labelMode)
					.onChange(async (value: any) => {
						this.plugin.settings.labelMode = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Vertical label height")
			.setDesc("Maximum height in pixels for vertical event labels before text truncates.")
			.addSlider((slider) =>
				slider
					.setLimits(60, 360, 10)
					.setValue(this.plugin.settings.verticalLabelMaxHeight || 120)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.verticalLabelMaxHeight = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use note alias as label")
			.setDesc(
				"When enabled, uses the first alias from the note's frontmatter (aliases / alias) as the event label instead of the note name."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useAliasAsLabel ?? false)
					.onChange(async (value) => {
						this.plugin.settings.useAliasAsLabel = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show today marker")
			.setDesc("Highlight the current date with a vertical indicator line and badge.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showToday)
					.onChange(async (value) => {
						this.plugin.settings.showToday = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Today marker color")
			.setDesc(
				"Color used for the current day vertical line and badge (defaults to bright red)."
			)
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.todayMarkerColor || "#ff3333")
					.onChange(async (value) => {
						this.plugin.settings.todayMarkerColor = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show time grid")
			.setDesc("Show subtle vertical grid lines for weeks and days.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGrid)
					.onChange(async (value) => {
						this.plugin.settings.showGrid = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show day ticks")
			.setDesc(
				"Show vertical day tick marks along the central timeline axis when zoomed in."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDayTicks)
					.onChange(async (value) => {
						this.plugin.settings.showDayTicks = value;
						await this.plugin.saveSettings();
					})
			);

		// SECTION: CATEGORIES & CONDITIONS
		containerEl.createEl("h3", { text: "Categories & Conditions" });
		containerEl.createEl("p", {
			text: "Organize notes into categories using conditions (tags, file name, folder, path, or frontmatter properties). Categories are evaluated top-to-bottom — first match wins. Drag categories to reorder priority.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show uncategorized notes")
			.setDesc(
				"When disabled (default), only notes matching at least one enabled category are shown on the timeline. Enable to also show dated notes that match no category."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showUncategorizedNotes ?? false)
					.onChange(async (value) => {
						this.plugin.settings.showUncategorizedNotes = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.showUncategorizedNotes) {
			const defaultColorSetting = new Setting(containerEl)
				.setName("Default event color")
				.setDesc(
					"Fallback color for uncategorized events. Leave as theme accent or pick a custom hex color."
				);

			this.renderColorControl(
				defaultColorSetting.controlEl,
				this.plugin.settings.defaultColor || "var(--interactive-accent)",
				async (newColor) => {
					this.plugin.settings.defaultColor = newColor;
					await this.plugin.saveSettings();
				}
			);
		}

		const categoriesContainer = containerEl.createDiv({ cls: "timeline-settings-categories" });
		this.renderCategorySettings(categoriesContainer);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Add Category")
				.setCta()
				.onClick(async () => {
					const newId = "cat-" + Date.now();
					this.plugin.settings.categories.push({
						id: newId,
						name: "New Category",
						color: "var(--interactive-accent)",
						enabled: true,
						matchMode: "all",
						conditions: [{ property: "file.tags", operator: "contains", value: "" }],
					});
					this.expandedCategories.add(newId);
					await this.plugin.saveSettings();
					this.renderCategorySettings(categoriesContainer);
				})
		);
	}

	private renderColorControl(
		parent: HTMLElement,
		initialColor: string,
		onChange: (newColor: string) => Promise<void>
	) {
		const colorCell = parent.createDiv({ cls: "category-color-cell" });
		const swatch = colorCell.createDiv({ cls: "category-color-swatch" });
		swatch.style.backgroundColor = initialColor || "var(--interactive-accent)";
		swatch.title = "Pick color";

		const picker = swatch.createEl("input", {
			type: "color",
			cls: "category-color-picker",
		});
		picker.value = this.resolveHexForPicker(initialColor);

		const textInput = colorCell.createEl("input", {
			type: "text",
			cls: "category-color-text-input",
		});
		textInput.value = initialColor || "var(--interactive-accent)";
		textInput.placeholder = "var(--interactive-accent) or #hex";

		picker.oninput = async () => {
			const val = picker.value;
			textInput.value = val;
			swatch.style.backgroundColor = val;
			await onChange(val);
		};

		textInput.onchange = async () => {
			const val = textInput.value.trim() || "var(--interactive-accent)";
			textInput.value = val;
			swatch.style.backgroundColor = val;
			picker.value = this.resolveHexForPicker(val);
			await onChange(val);
		};
	}

	private renderCategorySettings(container: HTMLElement) {
		container.empty();

		let draggedIndex: number | null = null;

		for (let i = 0; i < this.plugin.settings.categories.length; i++) {
			const cat = normalizeCategoryConfig(this.plugin.settings.categories[i]);
			const isExpanded = this.expandedCategories.has(cat.id);

			const card = container.createDiv({
				cls: `timeline-category-card ${cat.enabled ? "" : "is-disabled"}`,
			});

			card.ondragover = (e) => {
				e.preventDefault();
				card.addClass("is-drag-over");
			};
			card.ondragleave = () => {
				card.removeClass("is-drag-over");
			};
			card.ondrop = async (e) => {
				e.preventDefault();
				card.removeClass("is-drag-over");
				if (draggedIndex !== null && draggedIndex !== i) {
					const [moved] = this.plugin.settings.categories.splice(draggedIndex, 1);
					this.plugin.settings.categories.splice(i, 0, moved);
					draggedIndex = null;
					await this.plugin.saveSettings();
					this.renderCategorySettings(container);
				}
			};

			// HEADER ROW
			const header = card.createDiv({ cls: "timeline-category-card-header" });

			const dragHandle = header.createSpan({
				cls: "category-drag-handle",
				text: "⋮⋮",
				title: "Drag to reorder priority",
			});
			dragHandle.draggable = true;
			dragHandle.ondragstart = (e) => {
				draggedIndex = i;
				card.addClass("is-dragging");
				e.dataTransfer?.setData("text/plain", String(i));
			};
			dragHandle.ondragend = () => {
				draggedIndex = null;
				card.removeClass("is-dragging");
			};

			const chevron = header.createSpan({ cls: "category-expand-chevron" });
			setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");

			// Enabled checkbox
			const toggle = header.createEl("input", { type: "checkbox" });
			toggle.checked = cat.enabled;
			toggle.title = "Enable / Disable Category";
			toggle.onclick = (e) => e.stopPropagation();
			toggle.onchange = async () => {
				cat.enabled = toggle.checked;
				card.toggleClass("is-disabled", !cat.enabled);
				await this.plugin.saveSettings();
			};

			// Color swatch in header
			const headerSwatch = header.createDiv({ cls: "category-color-swatch" });
			headerSwatch.style.backgroundColor = cat.color || "var(--interactive-accent)";
			headerSwatch.title = "Pick category color";
			headerSwatch.onclick = (e) => e.stopPropagation();

			const headerPicker = headerSwatch.createEl("input", {
				type: "color",
				cls: "category-color-picker",
			});
			headerPicker.value = this.resolveHexForPicker(cat.color);
			headerPicker.oninput = async () => {
				cat.color = headerPicker.value;
				headerSwatch.style.backgroundColor = cat.color;
				await this.plugin.saveSettings();
				if (isExpanded) {
					this.renderCategorySettings(container);
				}
			};

			// Category Name pill
			const nameSpan = header.createSpan({
				cls: "category-header-name",
				text: cat.name || "Unnamed Category",
			});

			if (cat.recurring) {
				header.createSpan({
					cls: "category-recurring-badge",
					text: cat.isBirthday ? "Yearly · Birthday" : "Yearly",
				});
			}

			// Condition count summary
			const condCount = cat.conditions?.length || 0;
			header.createSpan({
				cls: "category-condition-count",
				text: condCount === 1 ? "1 condition" : `${condCount} conditions`,
			});

			// Delete button
			const deleteBtn = header.createEl("button", {
				text: "✕",
				cls: "category-delete-btn",
				title: "Delete Category",
			});
			deleteBtn.onclick = async (e) => {
				e.stopPropagation();
				this.plugin.settings.categories.splice(i, 1);
				this.expandedCategories.delete(cat.id);
				await this.plugin.saveSettings();
				this.renderCategorySettings(container);
			};

			header.onclick = () => {
				if (this.expandedCategories.has(cat.id)) {
					this.expandedCategories.delete(cat.id);
				} else {
					this.expandedCategories.add(cat.id);
				}
				this.renderCategorySettings(container);
			};

			// EXPANDED BODY
			if (isExpanded) {
				const body = card.createDiv({ cls: "timeline-category-card-body" });

				const topFields = body.createDiv({ cls: "category-body-top-row" });

				// Name input
				const nameGroup = topFields.createDiv({ cls: "category-field-group" });
				nameGroup.createDiv({ cls: "category-field-label", text: "Category name" });
				const nameInput = nameGroup.createEl("input", {
					type: "text",
					cls: "category-name-input",
					value: cat.name,
				});
				nameInput.placeholder = "Category Name";
				nameInput.oninput = async () => {
					cat.name = nameInput.value.trim() || "Unnamed Category";
					nameSpan.setText(cat.name);
					await this.plugin.saveSettings();
				};

				// Color input + swatch
				const colorGroup = topFields.createDiv({ cls: "category-field-group" });
				colorGroup.createDiv({ cls: "category-field-label", text: "Color" });
				this.renderColorControl(colorGroup, cat.color, async (newColor) => {
					cat.color = newColor;
					headerSwatch.style.backgroundColor = newColor;
					headerPicker.value = this.resolveHexForPicker(newColor);
					await this.plugin.saveSettings();
				});

				// Recurring options row
				const recurRow = body.createDiv({ cls: "category-recurring-row" });

				const recurLabel = recurRow.createEl("label", { cls: "category-checkbox-label" });
				const recurCheck = recurLabel.createEl("input", { type: "checkbox" });
				recurCheck.checked = cat.recurring ?? false;
				recurLabel.createSpan({ text: "Recurring yearly (repeats on the same month & day every year)" });
				recurCheck.onchange = async () => {
					cat.recurring = recurCheck.checked;
					if (!cat.recurring) {
						cat.isBirthday = false;
					}
					await this.plugin.saveSettings();
					this.renderCategorySettings(container);
				};

				if (cat.recurring) {
					const bdayLabel = recurRow.createEl("label", { cls: "category-checkbox-label is-nested" });
					const bdayCheck = bdayLabel.createEl("input", { type: "checkbox" });
					bdayCheck.checked = cat.isBirthday ?? false;
					bdayLabel.createSpan({ text: "Birthday label format (shows \"<Note Title>'s birthday\")" });
					bdayCheck.onchange = async () => {
						cat.isBirthday = bdayCheck.checked;
						await this.plugin.saveSettings();
						this.renderCategorySettings(container);
					};
				}

				// Match mode (All AND / Any OR)
				const condHeaderRow = body.createDiv({ cls: "category-conditions-header" });
				condHeaderRow.createSpan({ cls: "category-field-label", text: "Conditions" });

				if ((cat.conditions?.length || 0) > 1) {
					const matchWrap = condHeaderRow.createDiv({ cls: "category-match-mode" });
					matchWrap.createSpan({ text: "Match:" });
					const matchSelect = matchWrap.createEl("select", { cls: "timeline-select" });
					matchSelect.createEl("option", {
						value: "all",
						text: "All conditions (AND)",
					});
					matchSelect.createEl("option", {
						value: "any",
						text: "Any condition (OR)",
					});
					matchSelect.value = cat.matchMode || "all";
					matchSelect.onchange = async () => {
						cat.matchMode = matchSelect.value as "all" | "any";
						await this.plugin.saveSettings();
					};
				}

				const condBox = body.createDiv({ cls: "timeline-conditions-box" });
				if (!cat.conditions) cat.conditions = [];
				this.renderConditionsList(condBox, cat.conditions, () =>
					this.renderCategorySettings(container)
				);
			}
		}
	}

	private renderConditionsList(
		container: HTMLElement,
		conditions: FilterCondition[],
		onRefresh: () => void
	) {
		container.empty();

		if (conditions.length === 0) {
			container.createDiv({
				cls: "timeline-conditions-empty",
				text: 'No conditions yet. Click "+ Add condition" below.',
			});
		}

		for (let cIdx = 0; cIdx < conditions.length; cIdx++) {
			const cond = conditions[cIdx];
			const row = container.createDiv({ cls: "timeline-condition-row" });

			const isBuiltin = BUILTIN_PROPERTIES.some(
				(p) => p.value !== "custom" && p.value === cond.property
			);

			// 1. Property selector
			const propSelect = row.createEl("select", { cls: "timeline-select condition-prop-select" });
			for (const p of BUILTIN_PROPERTIES) {
				const opt = propSelect.createEl("option", { value: p.value, text: p.label });
				if (
					cond.property === p.value ||
					(p.value === "custom" && !isBuiltin)
				) {
					opt.selected = true;
				}
			}

			propSelect.onchange = async () => {
				if (propSelect.value === "custom") {
					cond.property = "status";
				} else {
					cond.property = propSelect.value;
				}
				const validOps = getValidOperators(cond.property);
				if (!validOps.some((o) => o.value === cond.operator)) {
					cond.operator = validOps[0].value;
				}
				await this.plugin.saveSettings();
				onRefresh();
			};

			// 2. Custom property key input (if custom)
			if (!isBuiltin) {
				const customKeyInput = row.createEl("input", {
					type: "text",
					cls: "condition-custom-prop-input",
					value: cond.property,
				});
				customKeyInput.placeholder = "frontmatter key";
				customKeyInput.oninput = async () => {
					cond.property = customKeyInput.value.trim() || "status";
					await this.plugin.saveSettings();
				};
			}

			// 3. Operator selector
			const validOps = getValidOperators(cond.property);
			if (!validOps.some((o) => o.value === cond.operator)) {
				cond.operator = validOps[0].value;
			}
			const opSelect = row.createEl("select", { cls: "timeline-select condition-op-select" });
			for (const op of validOps) {
				const opt = opSelect.createEl("option", { value: op.value, text: op.label });
				if (cond.operator === op.value) opt.selected = true;
			}
			opSelect.onchange = async () => {
				cond.operator = opSelect.value as ConditionOperator;
				await this.plugin.saveSettings();
				onRefresh();
			};

			// 4. Value input (hidden for exists / doesNotExist)
			if (cond.operator !== "exists" && cond.operator !== "doesNotExist") {
				if (cond.property === "file.tags") {
					const tagPillBox = row.createDiv({ cls: "condition-tag-pill-box" });
					this.renderTagPillsInput(tagPillBox, cond);
				} else {
					const valInput = row.createEl("input", {
						type: "text",
						cls: "condition-value-input",
						value: cond.value ?? "",
					});
					if (cond.operator === "matchesDatePattern") {
						valInput.placeholder = "YYYY-MM-DD";
						if (!cond.value) {
							cond.value = "YYYY-MM-DD";
							valInput.value = "YYYY-MM-DD";
						}
					} else if (cond.property === "file.folder") {
						valInput.placeholder = "Calendar/Events";
					} else {
						valInput.placeholder = "value";
					}
					valInput.oninput = async () => {
						cond.value = valInput.value.trim();
						await this.plugin.saveSettings();
					};
				}
			}

			// 5. Conditional options (Include subfolders / require additional text)
			if (
				cond.property === "file.folder" &&
				(cond.operator === "is" || cond.operator === "isNot")
			) {
				const subLabel = row.createEl("label", { cls: "condition-extra-toggle" });
				const subCheck = subLabel.createEl("input", { type: "checkbox" });
				subCheck.checked = cond.includeSubfolders ?? false;
				subCheck.onchange = async () => {
					cond.includeSubfolders = subCheck.checked;
					await this.plugin.saveSettings();
				};
				subLabel.createSpan({ text: "Subfolders" });
			}

			if (cond.operator === "matchesDatePattern") {
				const extraLabel = row.createEl("label", { cls: "condition-extra-toggle" });
				const extraCheck = extraLabel.createEl("input", { type: "checkbox" });
				extraCheck.checked = cond.requireAdditionalText ?? false;
				extraCheck.onchange = async () => {
					cond.requireAdditionalText = extraCheck.checked;
					await this.plugin.saveSettings();
				};
				extraLabel.createSpan({ text: "+ text" });
			}

			// 6. Delete condition button
			const delCondBtn = row.createEl("button", {
				text: "✕",
				cls: "category-delete-btn",
				title: "Remove condition",
			});
			delCondBtn.onclick = async () => {
				conditions.splice(cIdx, 1);
				await this.plugin.saveSettings();
				onRefresh();
			};
		}

		const addCondBtn = container.createEl("button", {
			text: "+ Add condition",
			cls: "timeline-btn timeline-add-condition-btn",
		});
		addCondBtn.onclick = async () => {
			conditions.push({
				property: "file.tags",
				operator: "contains",
				value: "",
			});
			await this.plugin.saveSettings();
			onRefresh();
		};
	}

	private renderTagPillsInput(
		container: HTMLElement,
		cond: FilterCondition,
		shouldFocus: boolean = false
	) {
		container.empty();

		const tags = cond.value
			? cond.value
					.split(",")
					.map((t) => t.replace(/^#/, "").trim())
					.filter((t) => t.length > 0)
			: [];

		const commitTags = async (updated: string[], keepFocus: boolean) => {
			cond.value = updated.join(", ");
			await this.plugin.saveSettings();
			this.renderTagPillsInput(container, cond, keepFocus);
		};

		for (let i = 0; i < tags.length; i++) {
			const chip = container.createSpan({ cls: "condition-tag-chip" });
			chip.createSpan({ text: tags[i] });
			const removeBtn = chip.createSpan({
				cls: "condition-tag-chip-remove",
				text: "×",
				title: "Remove tag",
			});
			removeBtn.onclick = async (e) => {
				e.stopPropagation();
				tags.splice(i, 1);
				await commitTags(tags, true);
			};
		}

		const listId = "timeline-tags-datalist-" + Math.random().toString(36).slice(2, 8);
		const tagInput = container.createEl("input", {
			type: "text",
			cls: "condition-tag-inline-input",
			attr: {
				placeholder: tags.length === 0 ? "Add tag…" : "",
				list: listId,
			},
		});

		const datalist = container.createEl("datalist", { attr: { id: listId } });
		for (const vaultTag of this.getVaultTags()) {
			if (!tags.includes(vaultTag)) {
				datalist.createEl("option", { value: vaultTag });
			}
		}

		const addPendingTag = async (raw: string, keepFocus: boolean) => {
			const parts = raw
				.split(",")
				.map((t) => t.replace(/^#/, "").trim())
				.filter((t) => t.length > 0);
			if (parts.length === 0) return;
			let changed = false;
			for (const p of parts) {
				if (!tags.includes(p)) {
					tags.push(p);
					changed = true;
				}
			}
			if (changed) {
				await commitTags(tags, keepFocus);
			} else {
				tagInput.value = "";
			}
		};

		tagInput.onkeydown = async (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === ",") {
				e.preventDefault();
				await addPendingTag(tagInput.value, true);
			} else if (e.key === "Backspace" && tagInput.value === "" && tags.length > 0) {
				e.preventDefault();
				tags.pop();
				await commitTags(tags, true);
			}
		};

		tagInput.onchange = async () => {
			if (tagInput.value.trim()) {
				await addPendingTag(tagInput.value, false);
			}
		};

		tagInput.onblur = async () => {
			if (tagInput.value.trim()) {
				await addPendingTag(tagInput.value, false);
			}
		};

		container.onclick = () => {
			tagInput.focus();
		};

		if (shouldFocus) {
			setTimeout(() => tagInput.focus(), 0);
		}
	}

	private getVaultTags(): string[] {
		const tags = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fmTags = cache?.frontmatter?.tags ?? cache?.frontmatter?.tag;
			if (Array.isArray(fmTags)) {
				for (const t of fmTags) {
					const clean = String(t).replace(/^#/, "").trim();
					if (clean) tags.add(clean);
				}
			} else if (typeof fmTags === "string") {
				for (const part of fmTags.split(/[,\s]+/)) {
					const clean = part.replace(/^#/, "").trim();
					if (clean) tags.add(clean);
				}
			}
			if (cache?.tags) {
				for (const t of cache.tags) {
					const clean = t.tag.replace(/^#/, "").trim();
					if (clean) tags.add(clean);
				}
			}
		}
		return Array.from(tags).sort();
	}

	private resolveHexForPicker(color: string): string {
		const trimmed = (color || "").trim();
		if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
			return trimmed;
		}
		if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
			return (
				"#" +
				trimmed[1] +
				trimmed[1] +
				trimmed[2] +
				trimmed[2] +
				trimmed[3] +
				trimmed[3]
			);
		}
		const probe = document.createElement("div");
		probe.style.display = "none";
		probe.style.color = trimmed || "var(--interactive-accent)";
		document.body.appendChild(probe);
		const computed = getComputedStyle(probe).color;
		probe.remove();
		const m = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (m) {
			const hex = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
			return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
		}
		return "#6c849d";
	}
}
