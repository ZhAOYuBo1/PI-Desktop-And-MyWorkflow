import { Check, ChevronDown, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SelectMenuOption {
	value: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	disabled?: boolean;
}

export function SelectMenu({
	value,
	options,
	onChange,
	label,
	placeholder = "请选择",
	searchPlaceholder = "搜索或选择",
	searchable = false,
	disabled = false,
}: {
	value: string;
	options: SelectMenuOption[];
	onChange(value: string): void;
	label: string;
	placeholder?: string;
	searchPlaceholder?: string;
	searchable?: boolean;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [typing, setTyping] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const suppressFocusOpenRef = useRef(false);
	const selected = options.find((option) => option.value === value);
	const normalizedQuery = query.trim().toLowerCase();
	const filteredOptions = useMemo(
		() =>
			normalizedQuery
				? options.filter(
						(option) =>
							option.label.toLowerCase().includes(normalizedQuery) ||
							option.value.toLowerCase().includes(normalizedQuery) ||
							option.description?.toLowerCase().includes(normalizedQuery),
					)
				: options,
		[normalizedQuery, options],
	);
	const closeMenu = useCallback((): void => {
		setOpen(false);
		setQuery("");
		setTyping(false);
		setActiveIndex(0);
	}, []);

	useEffect(() => {
		if (!open) return;
		const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
		setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
	}, [filteredOptions, open, value]);

	useEffect(() => {
		if (!open) return;
		optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
	}, [activeIndex, open]);

	useEffect(() => {
		if (!open) return;
		const closeOnOutside = (event: PointerEvent): void => {
			if (!rootRef.current?.contains(event.target as Node)) closeMenu();
		};
		const closeOnEscape = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				closeMenu();
				if (searchable) searchInputRef.current?.focus();
				else triggerRef.current?.focus();
			}
		};
		document.addEventListener("pointerdown", closeOnOutside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [closeMenu, open, searchable]);

	return (
		<div className={`select-menu${open ? " is-open" : ""}`} ref={rootRef}>
			{searchable ? (
				<div
					className="select-menu-trigger select-menu-search-trigger"
					onPointerDown={(event) => {
						if (event.target instanceof HTMLInputElement) return;
						event.preventDefault();
						setOpen(true);
						searchInputRef.current?.focus();
					}}
				>
					{open && typing ? (
						<Search size={14} strokeWidth={2} aria-hidden="true" />
					) : selected?.icon ? (
						<span className="select-menu-option-icon">{selected.icon}</span>
					) : null}
					<input
						ref={searchInputRef}
						role="combobox"
						aria-label={label}
						aria-haspopup="listbox"
						aria-expanded={open}
						value={open && typing ? query : (selected?.label ?? "")}
						placeholder={searchPlaceholder}
						disabled={disabled}
						onFocus={(event) => {
							if (suppressFocusOpenRef.current) {
								suppressFocusOpenRef.current = false;
								return;
							}
							setOpen(true);
							setTyping(false);
							event.currentTarget.select();
						}}
						onClick={() => setOpen(true)}
						onChange={(event) => {
							setTyping(true);
							setQuery(event.target.value);
							setOpen(true);
						}}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setOpen(true);
								setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
							}
							if (event.key === "ArrowUp") {
								event.preventDefault();
								setOpen(true);
								setActiveIndex((current) => Math.max(current - 1, 0));
							}
							if (event.key === "Enter") {
								const option = filteredOptions[activeIndex] ?? filteredOptions[0];
								if (!option) return;
								event.preventDefault();
								onChange(option.value);
								closeMenu();
								suppressFocusOpenRef.current = true;
								searchInputRef.current?.focus();
							}
						}}
					/>
					<ChevronDown className="select-menu-chevron" size={14} strokeWidth={2} aria-hidden="true" />
				</div>
			) : (
				<button
					ref={triggerRef}
					type="button"
					className="select-menu-trigger"
					aria-label={label}
					aria-haspopup="listbox"
					aria-expanded={open}
					disabled={disabled}
					onClick={() => setOpen((current) => !current)}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setOpen(true);
							setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setOpen(true);
							setActiveIndex((current) => Math.max(current - 1, 0));
						}
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							if (!open) {
								setOpen(true);
								return;
							}
							const option = filteredOptions[activeIndex] ?? filteredOptions[0];
							if (!option) return;
							onChange(option.value);
							closeMenu();
							triggerRef.current?.focus();
						}
					}}
				>
					<span className="select-menu-trigger-content">
						{selected?.icon ? <span className="select-menu-option-icon">{selected.icon}</span> : null}
						<span>{selected?.label ?? placeholder}</span>
					</span>
					<ChevronDown className="select-menu-chevron" size={14} strokeWidth={2} aria-hidden="true" />
				</button>
			)}
			{open ? (
				<div className="select-menu-list" role="listbox" aria-label={label}>
					{filteredOptions.length === 0 ? (
						<div className="select-menu-empty">{searchable ? "没有匹配项" : placeholder}</div>
					) : null}
					{filteredOptions.map((option, index) => (
						<button
							ref={(element) => {
								optionRefs.current[index] = element;
							}}
							key={option.value}
							type="button"
							role="option"
							aria-selected={option.value === value}
							disabled={option.disabled}
							className={`select-menu-option${option.value === value ? " is-selected" : ""}${
								index === activeIndex ? " is-active" : ""
							}`}
							onMouseEnter={() => setActiveIndex(index)}
							onClick={() => {
								onChange(option.value);
								closeMenu();
								if (searchable) {
									suppressFocusOpenRef.current = true;
									searchInputRef.current?.focus();
								} else {
									triggerRef.current?.focus();
								}
							}}
						>
							<span className="select-menu-option-content">
								{option.icon ? <span className="select-menu-option-icon">{option.icon}</span> : null}
								<span className="select-menu-option-copy">
									<strong>{option.label}</strong>
									{option.description ? <small>{option.description}</small> : null}
								</span>
							</span>
							{option.value === value ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : null}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
