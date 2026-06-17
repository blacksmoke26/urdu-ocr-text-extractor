/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */
/* eslint-disable */

import React, {useEffect, useMemo, useState, useRef, useCallback} from 'react';
import {
  Box,
  Flex,
  ScrollArea,
  Separator,
  Text,
  Select,
  Popover,
  TextField
} from '@radix-ui/themes';

// hooks
import useDebounce from '#/hooks/useDebounce';

// ui components
import {LoadingDots} from './Loading';
import {Check, ChevronDown, ChevronUp, ZoomOut, X} from 'lucide-react';

/**
 * Represents an individual option in a select component, extending base item properties.
 * Used for defining selectable items with value, label, and optional disabled state.
 * @example
 * const option: SelectOption = { value: '1', label: 'Option 1' };
 * @developerNotes
 * This interface allows for extensibility via the index signature, making it flexible for additional properties.
 */
export interface SelectOption extends Select.ItemProps {
  [key: string]: any;

  /** The unique identifier for the option */
  value: string;
  /** The display text for the option */
  label: string;
  /** An optional description for the option */
  description?: string;
  /**
   * Whether the option is disabled.
   * @default false
   */
  disabled?: boolean;
}

/**
 * Represents a group of options within a select component, typically used for grouping related items.
 * @example
 * const groupedOption: GroupedOption = {
 *   label: 'Fruits',
 *   options: [{ value: 'apple', label: 'Apple' }, { value: 'banana', label: 'Banana' }]
 * };
 * @developerNotes
 * This interface is ideal for organizing options into categories, and supports additional properties via the index signature.
 */
export interface GroupedOption {
  [key: string]: any;

  /** The label for the group */
  label: string;
  /** An array of options belonging to this group */
  options?: SelectOption[];
}

/**
 * Props for the advanced select component, combining core props with additional customization options.
 * @example
 * const props: SelectAdvancedProps = {
 *   options: [{ value: '1', label: 'Option 1' }],
 *   value: '1',
 *   onChange: (value) => console.log('Selected:', value),
 *   formatValue: (option) => <span style={{ color: 'blue' }}>{option?.label}</span>
 * };
 * @developerNotes
 * This interface provides full control over selection behavior, UI appearance, and advanced interactions.
 */
export interface SelectAdvancedProps extends Omit<Select.RootProps, 'onValueChange'> {
  /**
   * The list of options to display in the dropdown, supporting both flat and grouped structures.
   * @example
   * options: [
   *   { value: '1', label: 'Option 1' },
   *   { label: 'Group', options: [{ value: '2', label: 'Suboption' }] }
   * ]
   */
  options: (SelectOption | GroupedOption)[];

  /**
   * The currently selected value.
   */
  value: string;

  /**
   * Callback triggered when the selected value changes.
   * @param value - The new selected value.
   * @example
   * onChange: (value) => console.log('New value:', value);
   */
  onChange?(value: string): void;

  /**
   * The placeholder text displayed when no option is selected.
   * @example
   * placeholder: 'Select an item...'
   */
  placeholder?: string;

  /**
   * Whether the select component is disabled.
   * @example
   * disabled: true
   */
  disabled?: boolean;

  /**
   * Whether the select component allows clearing the selected value.
   * @example
   * clearable: true
   */
  clearable?: boolean;

  /**
   * Whether the select component is in loading state.
   * @example
   * loading: true
   */
  loading?: boolean;

  /**
   * The width of the trigger (select button) component.
   * @example
   * triggerWidth: '200px'
   */
  triggerWidth?: string;

  /**
   * Custom icon to render inside the trigger.
   * @example
   * icon: <Icon name="arrow-down" />
   */
  icon?: React.ReactNode;

  /**
   * Whether the select component allows searching through options.
   * @example
   * searchable: true
   */
  searchable?: boolean;

  /**
   * Whether the select component allows creating new options.
   * @example
   * creatable: true
   */
  creatable?: boolean;

  /**
   * Callback triggered when a new option is created.
   * @param value - The newly created option value.
   * @example
   * onCreateOption: (value) => console.log('Created option:', value);
   */
  onCreateOption?(value: string): void;

  /**
   * Callback triggered during search queries (for async loading).
   * @param query - The search query string.
   * @example
   * onSearch: (query) => console.log('Searching for:', query);
   */
  onSearch?(query: string): void;

  /**
   * The time in milliseconds to debounce search queries.
   * @example
   * debounceTime: 300
   */
  debounceTime?: number;

  /**
   * The message displayed when no results are found during search.
   * @example
   * noResultMessage: 'No matching results found.'
   */
  noResultMessage?: string;

  /**
   * Custom formatting function for the selected value in the trigger.
   * @param option - The full option object (or null if no selection).
   * @example
   * formatValue: (option) => <span style={{ color: 'blue' }}>{option?.label}</span>
   * @developerNotes
   * Use this to add icons, colors, or complex layouts to the selected value.
   */
  formatValue?(option: SelectOption | null): React.ReactNode;

  /**
   * Custom formatting function for individual labels in the dropdown.
   * @param option - The full option object.
   * @example
   * formatLabel: (option) => <span className="highlight">{option.label}</span>
   * @developerNotes
   * Use this to highlight text, add badges, or apply custom styles.
   */
  formatLabel?(option: SelectOption): React.ReactNode;

  /**
   * Full control over how each option is rendered in the dropdown.
   * @param option - The full option object.
   * @param isSelected - Whether the option is currently selected.
   * @param onSelect - Function to call when the option is selected.
   * @example
   * renderOption: (option, isSelected, onSelect) => (
   *   <div onClick={onSelect} style={{ backgroundColor: isSelected ? '#eee' : 'white' }}>
   *     {option.label}
   *   </div>
   * )
   * @developerNotes
   * This overrides formatLabel and allows full visual control, including custom click handling.
   */
  renderOption?(option: SelectOption, isSelected: boolean, onSelect: () => void): React.ReactNode;

  /**
   * Custom filtering function for search queries.
   * @param option - The full option object.
   * @param query - The search query string.
   * @example
   * filterOption: (option, query) => option.label.toLowerCase().includes(query.toLowerCase())
   * @developerNotes
   * Override this to implement custom filtering logic (e.g., fuzzy search).
   */
  filterOption?(option: SelectOption, query: string): boolean;

  /**
   * Custom function to format the selected option in the trigger.
   * @param label - The label of the selected option.
   * @param option - The full option object.
   */
  selectedOption?(label: string, option: SelectOption): React.ReactNode;
}

/**
 * Retrieves the SelectOption object with the specified value from an array of options.
 * Supports both flat and grouped option structures.
 * @example
 * const options = [
 *   { value: '1', label: 'Option 1' },
 *   { label: 'Group', options: [{ value: '2', label: 'Suboption' }] }
 * ];
 * const selectedOption = getOptionByValue(options, '2'); // { value: '2', label: 'Suboption' }
 * @developerNotes
 * This is a utility function that recursively searches through grouped and flat options to find a match by value.
 * Ideal for scenarios where options are nested in groups.
 */
export const getOptionByValue = (
  options: (SelectOption | GroupedOption)[],
  value: string,
): SelectOption | null => {
  for (const option of options) {
    const isGroup = 'options' in option;
    if (isGroup) {
      const found = option.options?.find((opt: SelectOption) => opt.value === value);
      if (found) return found;
    } else {
      if (option.value === value) return option as SelectOption;
    }
  }
  return null;
};

/**
 * Returns the label associated with the given value from an array of options.
 * A convenience wrapper around `getOptionByValue` that returns only the label.
 * @example
 * const options = [
 *   { value: '1', label: 'Option 1' },
 *   { label: 'Group', options: [{ value: '2', label: 'Suboption' }] }
 * ];
 * const label = getLabelByValue(options, '2'); // 'Suboption'
 * @developerNotes
 * This is a simple utility that leverages `getOptionByValue` internally.
 * Returns an empty string if no matching option is found.
 */
export const getLabelByValue = (options: (SelectOption | GroupedOption)[], value: string) => {
  const opt = getOptionByValue(options, value);
  return opt?.label ?? '';
};

/**
 * Flattens options into a single array for keyboard navigation purposes.
 */
const flattenOptions = (options: (SelectOption | GroupedOption)[]): SelectOption[] => {
  const flat: SelectOption[] = [];
  options.forEach((opt) => {
    if ('options' in opt) {
      flat.push(...(opt.options || []));
    } else {
      flat.push(opt as SelectOption);
    }
  });
  return flat;
};

/**
 * A highly customizable select component with advanced features like search, creation, and formatting.
 */
export const SelectAdvanced: React.FC<SelectAdvancedProps> = (props) => {
  const {
    options = [],
    value,
    onChange = () => {},
    selectedOption = () => {},
    placeholder = 'Select...',
    disabled = false,
    clearable = true,
    loading = false,
    triggerWidth = '200px',
    icon,

    // Advanced
    searchable = false,
    creatable = false,
    onCreateOption,
    onSearch,
    debounceTime = 300,
    noResultMessage = 'No results found.',

    // Render Props
    formatValue,
    formatLabel,
    renderOption,
    filterOption,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(searchQuery, debounceTime);

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, searchable]);

  // Handle Search Logic
  useEffect(() => {
    if (searchable && onSearch) {
      onSearch(debouncedQuery);
    }
  }, [debouncedQuery, onSearch, searchable]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  // --- Helper: Determine Display Content in Trigger ---
  const triggerContent = useMemo(() => {
    if (!value) return placeholder;
    if (formatValue) {
      const selectedOpt = getOptionByValue(options, value);
      return formatValue(selectedOpt);
    }
    return getLabelByValue(options, value) || value;
  }, [value, options, formatValue, placeholder]);

  // --- Helper: Filter Options ---
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery) return options;

    const lowerQuery = searchQuery.toLowerCase();
    const filtered: (SelectOption | GroupedOption)[] = [];

    options.forEach((option) => {
      const isGroup = 'options' in option;

      if (isGroup) {
        const matchingItems = option.options?.filter((opt) => {
          if (filterOption) return filterOption(opt, lowerQuery);
          return (
            opt.label.toLowerCase().includes(lowerQuery) ||
            opt.value.toLowerCase().includes(lowerQuery)
          );
        });

        if (matchingItems && matchingItems.length > 0) {
          filtered.push({...option, options: matchingItems});
        }
      } else {
        const isMatch = filterOption
          ? filterOption(option as SelectOption, lowerQuery)
          : (
            (option as SelectOption).label.toLowerCase().includes(lowerQuery) ||
            (option as SelectOption).value.toLowerCase().includes(lowerQuery)
          );

        if (isMatch) {
          filtered.push(option);
        }
      }
    });

    return filtered;
  }, [options, searchQuery, searchable, filterOption]);

  // --- Helper: Keyboard Navigation ---
  const flattenedOptions = useMemo(() => flattenOptions(filteredOptions), [filteredOptions]);
  const hasCreatableOption = creatable && searchQuery && !getOptionByValue(filteredOptions, searchQuery);

  const navOptions = useMemo(() => {
    if (hasCreatableOption) {
      return [...flattenedOptions, {value: searchQuery, label: `Create "${searchQuery}"`, isCreatable: true}];
    }
    return flattenedOptions;
  }, [flattenedOptions, hasCreatableOption, searchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (navOptions.length === 0) return -1;
          return prev < navOptions.length - 1 ? prev + 1 : prev;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev <= 0) return 0;
          return prev - 1;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && navOptions[focusedIndex]) {
          const option = navOptions[focusedIndex];
          if ('isCreatable' in option) {
            onCreateOption?.(option.value);
          }
          onChange?.(option.value);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  }, [isOpen, navOptions, focusedIndex, onChange, onCreateOption]);

  // ==========================================
  // 1. Standard Non-Searchable Select
  // ==========================================

  if (!searchable) {
    return (
      <Select.Root
        value={value}
        disabled={disabled || loading}
        onValueChange={onChange}
        onOpenChange={(open) => setIsOpen(open)}>
        <Select.Trigger
          className={(/^[0-9]/.test(triggerWidth) ? `w-[${triggerWidth}]` : triggerWidth) + ' SelectTrigger'}
          style={{width: triggerWidth}}>
          {/* Left Side: Icon and Text */}
          <Flex align="center" gap="2" as="span" className="overflow-hidden" style={{flex: 1}}>
            {/* FIX: Added color="gray" for Light theme visibility */}
            <Text className="truncate flex" size="2" color="gray">
              {selectedOption?.(triggerContent as string, getOptionByValue(options, value)!) ?? triggerContent}
            </Text>
          </Flex>

          {/* Right Side: Loading, Clear, Arrow Icon */}
          {/* Using Flex to group controls naturally without absolute positioning conflicts */}
          <Flex align="center" gap="2">
            {loading && <LoadingDots />}

            {clearable && value && !disabled && (
              <X
                height="14"
                width="14"
                color="gray"
                className="hover:text-red-500"
                onClick={handleClear}
                style={{cursor: 'pointer', zIndex: 1230}}
              />
            )}

            {/* Conditional Arrow Icon */}
            {isOpen ? <ChevronUp /> : <ChevronDown />}
          </Flex>
        </Select.Trigger>

        <Select.Content>
          <Select.Group>
            {options.map((opt, idx) => {
              const isGroup = 'options' in opt;
              if (isGroup) {
                return (
                  <div key={idx}>
                    <Select.Label>{opt.label}</Select.Label>
                    {opt.options?.map((groupOpt) => (
                      <Select.Item key={groupOpt.value} value={groupOpt.value} disabled={groupOpt.disabled}>
                        {formatLabel ? formatLabel(groupOpt) : groupOpt.label}
                      </Select.Item>
                    ))}
                  </div>
                );
              }
              return (
                <Select.Item key={opt.value} value={opt?.value ?? ''} disabled={opt.disabled}>
                  {formatLabel ? formatLabel(opt as SelectOption) : opt.label}
                </Select.Item>
              );
            })}
          </Select.Group>
        </Select.Content>
      </Select.Root>
    );
  }

  // ==========================================
  // 2. Searchable Combobox (Popover based)
  // ==========================================

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Flex
          align="center"
          justify="between"
          className={`w-[${triggerWidth}] h-9 px-2 rounded-md border border-gray-6 bg-gray-1 hover:bg-gray-2 data-[state=open]:bg-gray-2 cursor-pointer text-sm transition-colors`}
          style={{width: triggerWidth}}
          tabIndex={0}
        >
          <Flex align="center" gap="2" className="overflow-hidden">
            {icon}
            <Text className="truncate" size="2" color="gray">
              {selectedOption?.(triggerContent as string, getOptionByValue(options, value)!) ?? triggerContent}
            </Text>
          </Flex>

          <Flex align="center" gap="2">
            {loading && <LoadingDots />}
            {!loading && clearable && value && (
              <X
                className="hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear(e);
                }}
              />
            )}
            {!loading && (
              isOpen ? <ChevronUp /> : <ChevronDown />
            )}
          </Flex>
        </Flex>
      </Popover.Trigger>

      <Popover.Content
        style={{width: triggerWidth, padding: 0, zIndex: 50}}
        align="start"
        sideOffset={4}
        onKeyDown={handleKeyDown}
      >
        <Box px="2" pt="2" pb="0">
          <TextField.Root
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            ref={inputRef}
          >
            <TextField.Slot>
              <ZoomOut height="14" width="14"/>
            </TextField.Slot>
          </TextField.Root>
        </Box>

        <Separator size="4" my="2"/>

        {/* Scrollable List Area */}
        <ScrollArea
          style={{maxHeight: '200px'}}
          type="auto"
          scrollbars="vertical">
          <Box py="2">
            {filteredOptions.length === 0 && !hasCreatableOption && !loading ? (
              <Flex align="center" justify="center" py="4">
                <Text size="1" color="gray">{noResultMessage}</Text>
              </Flex>
            ) : (
              // Render Options
              filteredOptions.map((opt, idx) => {
                const isGroup = 'options' in opt;

                if (isGroup) {
                  return (
                    <Box key={idx}>
                      <Text size="1" weight="bold" color="gray" className="px-3 py-1">
                        {opt.label}
                      </Text>
                      {opt.options?.map((groupOpt) => {
                        const navIndex = navOptions.findIndex(o => o.value === groupOpt.value);
                        return (
                          <ComboboxItem
                            key={groupOpt.value}
                            option={groupOpt}
                            isSelected={value === groupOpt.value}
                            isFocused={focusedIndex === navIndex}
                            onSelect={() => {
                              onChange?.(groupOpt.value);
                              setIsOpen(false);
                            }}
                            formatLabel={formatLabel}
                            renderOption={renderOption}
                          />
                        );
                      })}
                    </Box>
                  );
                }

                const navIndex = navOptions.findIndex(o => o.value === opt.value);

                return (
                  <ComboboxItem
                    key={opt.value}
                    option={opt as SelectOption}
                    isSelected={value === opt.value}
                    isFocused={focusedIndex === navIndex}
                    onSelect={() => {
                      onChange?.(opt.value);
                      setIsOpen(false);
                    }}
                    formatLabel={formatLabel}
                    renderOption={renderOption}
                  />
                );
              })
            )}

            {hasCreatableOption && (
              <ComboboxItem
                option={{value: searchQuery, label: `Create "${searchQuery}"`}}
                isSelected={false}
                isFocused={focusedIndex === navOptions.length - 1}
                onSelect={() => {
                  onCreateOption?.(searchQuery);
                  onChange?.(searchQuery);
                  setIsOpen(false);
                }}
                formatLabel={formatLabel}
                renderOption={renderOption}
              />
            )}
          </Box>
        </ScrollArea>
      </Popover.Content>
    </Popover.Root>
  );
};

/**
 * Props for rendering a single item in a combobox, including selection state and formatting options.
 * Used internally by combobox components to render individual options.
 * @example
 * const props: ComboboxItemProps = {
 *   option: { value: '1', label: 'Option 1' },
 *   isSelected: true,
 *   onSelect: () => console.log('Selected'),
 *   formatLabel: (opt) => <span style={{ color: 'blue' }}>{opt.label}</span>
 * };
 * @developerNotes
 * This interface is designed to be flexible, allowing both basic and fully customized rendering
 * through the formatLabel and renderOption functions.
 */
export interface ComboboxItemProps {
  /**
   * The option data to be rendered.
   */
  option: SelectOption;

  /**
   * Whether the option is currently selected.
   */
  isSelected: boolean;

  /**
   * Whether the option is currently focused.
   */
  isFocused: boolean;

  /**
   * Callback function to trigger when the option is selected.
   */
  onSelect(): void;

  /**
   * Optional function to customize the label rendering.
   * @param option - The option object.
   * @example
   * formatLabel: (opt) => <span style={{ color: 'green' }}>{opt.label}</span>
   */
  formatLabel?(option: SelectOption): React.ReactNode;

  /**
   * Optional function to fully customize the rendering of the option.
   * @param option - The option object.
   * @param isSelected - Whether the option is selected.
   * @param onSelect - Function to call when the option is selected.
   * @example
   * renderOption: (opt, isSelected, onSelect) => (
   *   <div onClick={onSelect} style={{ backgroundColor: isSelected ? '#eee' : 'white' }}>
   *     {opt.label}
   *   </div>
   * )
   */
  renderOption?(option: SelectOption, isSelected: boolean, onSelect: () => void): React.ReactNode;
}

/**
 * A reusable component for rendering individual items in a combobox, supporting custom formatting and selection handling.
 * @example
 * <ComboboxItem
 *   option={{ value: '1', label: 'Option 1' }}
 *   isSelected={false}
 *   onSelect={() => console.log('Selected')}
 *   formatLabel={(opt) => <span style={{ color: 'blue' }}>{opt.label}</span>}
 * />
 * @developerNotes
 * This component is typically used within a combobox dropdown list.
 * It provides default rendering behavior but allows full customization through props.
 */
const ComboboxItem: React.FC<ComboboxItemProps> = (props) => {
  const {
    option,
    isSelected,
    isFocused,
    onSelect,
    formatLabel,
    renderOption,
  } = props;

// If custom renderer is provided, give full control
  if (renderOption) {
    return <>{renderOption(option, isSelected, onSelect)}</>;
  }

  const bgClass = isSelected
    ? 'bg-indigo-5'
    : isFocused
      ? 'bg-gray-4 text-gray-12'
      : 'hover:bg-gray-4 text-gray-12';

  return (
    <Flex
      align="center"
      justify="between"
      px="3"
      py="2"
      mx="2"
      className={`rounded-md text-sm cursor-pointer transition-colors ${bgClass}`}
      onClick={onSelect}
    >
      <Flex align="center" gap="2" className="flex-1 overflow-hidden">
        {formatLabel ? formatLabel(option) : (
          <Text className="truncate">{option.label}</Text>
        )}
      </Flex>
      {isSelected && <Check width={14} height={14}/>}
    </Flex>
  );
};
