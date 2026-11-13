import { App, PluginSettingTab, Setting } from "obsidian";
import { TimelinePlugin } from "./main";

export class TimelineSettingTab extends PluginSettingTab {
	private plugin: TimelinePlugin;

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

		// SECTION: DATE EXTRACTION
		containerEl.createEl("h3", { text: "Date Extraction" });

		new Setting(containerEl)
			.setName("Start date properties")
			.setDesc("Frontmatter property keys used for the start date (comma separated in priority order). Also falls back to YYYY-MM-DD in note title.")
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
			.setDesc("Frontmatter property keys used for multi-day event end dates (comma separated in priority order).")
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

		// SECTION: APPEARANCE & DISPLAY
		containerEl.createEl("h3", { text: "Display & Appearance" });

		new Setting(containerEl)
			.setName("Default view zoom (time span)")
			.setDesc("Visible time span when opening the timeline (e.g. 6 months, 6mo, 5 days, 2 weeks, 1 year).")
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
			.setDesc("Shifts the initial view relative to today. 0 centers today; -1 month shifts the view 1 month into the past (moving the today line 1 month to the right); +1 month shifts 1 month into the future.")
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
			.setDesc("Multiplier for mouse wheel and trackpad zoom speed (lower = finer control, higher = faster zoom).")
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
			.setDesc("Scale zoom speed with wheel velocity so slow notches are precise and fast spins cover ground quickly.")
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
			.setDesc("Auto switches from hidden (zoomed out) to vertical (medium) to horizontal (zoomed in).")
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
			.setDesc("When enabled, uses the first alias from the note's frontmatter (aliases / alias) as the event label instead of the note name.")
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
			.setDesc("Color used for the current day vertical line and badge (defaults to bright red).")
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
			.setDesc("Show vertical day tick marks along the central timeline axis when zoomed in.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDayTicks)
					.onChange(async (value) => {
						this.plugin.settings.showDayTicks = value;
						await this.plugin.saveSettings();
					})
			);

		const defaultColorSetting = new Setting(containerEl)
			.setName("Default event color")
			.setDesc("Fallback color for events. Leave as theme accent or pick a custom hex color.");

		const defaultColorCell = defaultColorSetting.controlEl.createDiv({ cls: "category-color-cell" });
		const defaultSwatch = defaultColorCell.createDiv({ cls: "category-color-swatch" });
		defaultSwatch.style.backgroundColor =
			this.plugin.settings.defaultColor || "var(--interactive-accent)";
		defaultSwatch.title = "Pick default event color";

		const defaultPicker = defaultSwatch.createEl("input", {
			type: "color",
			cls: "category-color-picker",
		});
		defaultPicker.value = this.resolveHexForPicker(this.plugin.settings.defaultColor);

		const defaultTextInput = defaultColorCell.createEl("input", {
			type: "text",
			cls: "category-color-text-input",
		});
		defaultTextInput.value = this.plugin.settings.defaultColor || "var(--interactive-accent)";
		defaultTextInput.placeholder = "var(--interactive-accent)";

		defaultPicker.oninput = async () => {
			this.plugin.settings.defaultColor = defaultPicker.value;
			defaultTextInput.value = defaultPicker.value;
			defaultSwatch.style.backgroundColor = defaultPicker.value;
			await this.plugin.saveSettings();
		};

		defaultTextInput.onchange = async () => {
			const val = defaultTextInput.value.trim() || "var(--interactive-accent)";
			this.plugin.settings.defaultColor = val;
			defaultTextInput.value = val;
			defaultSwatch.style.backgroundColor = val;
			defaultPicker.value = this.resolveHexForPicker(val);
			await this.plugin.saveSettings();
		};

		// SECTION: CATEGORIES & COLOR PALETTES
		containerEl.createEl("h3", { text: "Categories & Colors" });
		const catDesc = containerEl.createEl("p", {
			text: "Assign colors and names to events matching specific tags. Use 'var(--interactive-accent)' to match your Obsidian theme accent color.",
			cls: "setting-item-description",
		});

		const categoriesContainer = containerEl.createDiv({ cls: "timeline-settings-categories" });
		this.renderCategorySettings(categoriesContainer);

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Category")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.categories.push({
							id: "cat-" + Date.now(),
							name: "New Category",
							tag: "custom",
							color: "var(--interactive-accent)",
							enabled: true,
						});
						await this.plugin.saveSettings();
						this.renderCategorySettings(categoriesContainer);
					})
			);
	}

	private renderCategorySettings(container: HTMLElement) {
		container.empty();

		for (let i = 0; i < this.plugin.settings.categories.length; i++) {
			const cat = this.plugin.settings.categories[i];
			const row = container.createDiv({
				cls: `timeline-category-setting-row ${cat.enabled ? "" : "is-disabled"}`,
			});

			// Enabled toggle
			const toggle = row.createEl("input", { type: "checkbox" });
			toggle.checked = cat.enabled;
			toggle.title = "Enable / Disable Category";
			toggle.onchange = async () => {
				cat.enabled = toggle.checked;
				row.toggleClass("is-disabled", !cat.enabled);
				await this.plugin.saveSettings();
			};

			// Color swatch / native color picker + text input
			const colorCell = row.createDiv({ cls: "category-color-cell" });
			const swatch = colorCell.createDiv({ cls: "category-color-swatch" });
			swatch.style.backgroundColor = cat.color || "var(--interactive-accent)";
			swatch.title = "Pick color";

			const colorPicker = swatch.createEl("input", {
				type: "color",
				cls: "category-color-picker",
			});
			colorPicker.value = this.resolveHexForPicker(cat.color);

			const colorInput = colorCell.createEl("input", {
				type: "text",
				cls: "category-color-text-input",
			});
			colorInput.value = cat.color;
			colorInput.placeholder = "var(--interactive-accent) or #hex";
			colorInput.title = "Category Color (e.g. var(--interactive-accent) or #ff3333)";

			colorPicker.oninput = async () => {
				cat.color = colorPicker.value;
				colorInput.value = cat.color;
				swatch.style.backgroundColor = cat.color;
				await this.plugin.saveSettings();
			};

			colorInput.onchange = async () => {
				cat.color = colorInput.value.trim() || "var(--interactive-accent)";
				colorInput.value = cat.color;
				swatch.style.backgroundColor = cat.color;
				colorPicker.value = this.resolveHexForPicker(cat.color);
				await this.plugin.saveSettings();
			};

			// Name input
			const nameInput = row.createEl("input", { type: "text", cls: "category-name-input" });
			nameInput.placeholder = "Category Name";
			nameInput.value = cat.name;
			nameInput.onchange = async () => {
				cat.name = nameInput.value.trim();
				await this.plugin.saveSettings();
			};

			// Tag input
			const tagInput = row.createEl("input", { type: "text", cls: "category-tag-input" });
			tagInput.placeholder = "Tag (e.g. event)";
			tagInput.value = cat.tag;
			tagInput.onchange = async () => {
				cat.tag = tagInput.value.replace(/^#/, "").trim();
				await this.plugin.saveSettings();
			};

			// Delete button
			const deleteBtn = row.createEl("button", {
				text: "✕",
				cls: "category-delete-btn",
				title: "Delete Category",
			});
			deleteBtn.onclick = async () => {
				this.plugin.settings.categories.splice(i, 1);
				await this.plugin.saveSettings();
				this.renderCategorySettings(container);
			};
		}
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
