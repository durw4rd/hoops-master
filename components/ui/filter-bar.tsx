import React, { useState, useRef, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

// Mobile detection hook
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

export interface FilterItem {
  id: string;
  type: 'toggle' | 'dropdown' | 'multi-select' | 'toggle-buttons';
  label: string;
  value: any;
  options?: Array<{value: string, label: string}>;
  disabled?: boolean;
  description?: string;
}

export interface FilterBarProps {
  title?: string;
  filters: FilterItem[];
  onFilterChange: (filterId: string, value: any) => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({
  title = "Filters",
  filters,
  onFilterChange,
  isExpanded = false,
  onToggleExpanded,
  className
}) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(isMobile ? false : isExpanded);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Sync with external expanded state
  useEffect(() => {
    setIsOpen(isExpanded);
  }, [isExpanded]);

  // Close dropdown when clicking outside
    useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside any open dropdown
      if (dropdownOpen) {
        const currentRef = dropdownRefs.current[dropdownOpen];
        if (currentRef && !currentRef.contains(event.target as Node)) {
          setDropdownOpen(null);
        }
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggleExpanded?.();
  };

  const handleFilterChange = (filterId: string, value: any) => {
    onFilterChange(filterId, value);
  };



  const renderFilter = (filter: FilterItem) => {
    switch (filter.type) {
      case 'toggle':
        return (
          <div key={filter.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors">
            <Switch 
              id={filter.id} 
              checked={filter.value} 
              onCheckedChange={(checked) => handleFilterChange(filter.id, checked)}
              disabled={filter.disabled}
            />
            <label 
              htmlFor={filter.id} 
              className={cn(
                "text-sm text-gray-700 select-none cursor-pointer flex-1",
                filter.disabled && "text-gray-400"
              )}
            >
              {filter.label}
            </label>
          </div>
        );

      case 'dropdown':
        return (
          <div key={filter.id} className="relative" ref={(el) => { dropdownRefs.current[filter.id] = el; }}>
            <button
              onClick={() => setDropdownOpen(dropdownOpen === filter.id ? null : filter.id)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 touch-manipulation"
              disabled={filter.disabled}
            >
              <span className="truncate">
                {filter.options?.find(opt => opt.value === filter.value)?.label || filter.label}
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {dropdownOpen === filter.id && filter.options && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {filter.options.map(option => (
                  <div 
                    key={option.value}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer touch-manipulation"
                    onClick={() => {
                      handleFilterChange(filter.id, option.value);
                      setDropdownOpen(null);
                    }}
                  >
                    <span>{option.label}</span>
                    {filter.value === option.value && <span className="text-blue-600">✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'multi-select':
        return (
          <div key={filter.id} className="relative" ref={(el) => { dropdownRefs.current[filter.id] = el; }}>
            <button
              onClick={() => setDropdownOpen(dropdownOpen === filter.id ? null : filter.id)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 touch-manipulation"
              disabled={filter.disabled}
            >
              <span className="truncate">
                {filter.value && filter.value instanceof Set && filter.value.has('all') ? 
                   filter.options?.find(opt => opt.value === 'all')?.label || 'All' : 
                 filter.value && filter.value instanceof Set && filter.value.size === 1 ? 
                   filter.options?.find(opt => opt.value === Array.from(filter.value)[0])?.label :
                 filter.value && filter.value instanceof Set ? 
                   `${filter.value.size} selected` : 'All'}
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {dropdownOpen === filter.id && filter.options && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {filter.options.map(option => (
                  <div 
                    key={option.value}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer touch-manipulation"
                    onClick={() => {
                      // Ensure we have a valid Set to work with
                      const currentValue = filter.value instanceof Set ? new Set(filter.value) : new Set(['all']);
                      
                      if (option.value === 'all') {
                        // If clicking "All", reset to just "All"
                        const newValue = new Set(['all']);
                        handleFilterChange(filter.id, newValue);
                        setDropdownOpen(null);
                      } else if (currentValue.has(option.value)) {
                        // Remove this option
                        currentValue.delete(option.value);
                        // If no options left, default to "All"
                        if (currentValue.size === 0) {
                          currentValue.add('all');
                        }
                        handleFilterChange(filter.id, currentValue);
                        // Don't close dropdown - keep it open for multiple selections
                      } else {
                        // Add this option, but remove "All" since we're selecting specific items
                        currentValue.delete('all');
                        currentValue.add(option.value);
                        handleFilterChange(filter.id, currentValue);
                        // Don't close dropdown - keep it open for multiple selections
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    {filter.value && filter.value instanceof Set && filter.value.has(option.value) && <span className="text-blue-600">✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'toggle-buttons':
        return (
          <div key={filter.id} className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{filter.label}</label>
            <div className="flex flex-wrap gap-2">
              {filter.options?.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    const currentValue = filter.value instanceof Set ? new Set(filter.value) : new Set(['all']);
                    
                    if (option.value === 'all') {
                      // If clicking "All", reset to just "All"
                      handleFilterChange(filter.id, new Set(['all']));
                    } else if (currentValue.has(option.value)) {
                      // Remove this option
                      currentValue.delete(option.value);
                      // If no options left, default to "All"
                      if (currentValue.size === 0) {
                        currentValue.add('all');
                      }
                      handleFilterChange(filter.id, currentValue);
                    } else {
                      // Add this option, but remove "All" since we're selecting specific items
                      currentValue.delete('all');
                      currentValue.add(option.value);
                      handleFilterChange(filter.id, currentValue);
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors",
                    filter.value instanceof Set && filter.value.has(option.value)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );

      default:
        return null;
      }
    };

  return (
    <div className={cn("bg-gray-50 border border-gray-200 rounded-lg p-3", className)}>
      {/* Header - Always visible */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">{title}</span>
        </div>
        <button
          onClick={handleToggle}
          className="p-2 hover:bg-gray-200 rounded transition-colors touch-manipulation"
          aria-label={isOpen ? "Collapse filters" : "Expand filters"}
        >
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>
      </div>

      {/* Filter Content - Expandable */}
      {isOpen && (
        <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
          {filters.map(renderFilter)}
        </div>
      )}
    </div>
  );
};

export default FilterBar; 