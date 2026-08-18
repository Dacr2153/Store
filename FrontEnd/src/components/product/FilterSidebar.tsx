import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FilterOption {
    id: string;
    name: string;
    count?: number; // La propiedad 'count' es opcional
}

interface PriceRange {
    min: number;
    max: number;
}

interface ColorOption extends FilterOption {
    hex: string;
}

interface FilterSidebarProps {
    onFilterChange: (categoryId: string, optionId: string, isChecked: boolean) => void;
    onPriceChange: (range: PriceRange) => void;
    onColorSelect: (colorId: string) => void;
    selectedFilters: Set<string>;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    onFilterChange,
    onPriceChange,
    onColorSelect,
    selectedFilters
}) => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['category', 'size']));
    const [priceRange, setPriceRange] = useState<PriceRange>({ min: 0, max: 500 });

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>, type: 'min' | 'max') => {
        const value = parseInt(event.target.value) || 0;
        const newRange = {
            ...priceRange,
            [type]: value
        };
        setPriceRange(newRange);
        onPriceChange(newRange);
    };

    const categories = [
        {
            id: 'category',
            name: 'Category',
            options: [
                { id: 'clothing', name: 'Clothing', count: 342 },
                { id: 'makeup', name: 'Makeup', count: 157 },
                { id: 'skincare', name: 'Skincare', count: 83 },
                { id: 'accessories', name: 'Accessories', count: 95 }
            ]
        },
        {
            id: 'size',
            name: 'Size',
            options: [
                { id: 'xs', name: 'XS' },
                { id: 's', name: 'S' },
                { id: 'm', name: 'M' },
                { id: 'l', name: 'L' },
                { id: 'xl', name: 'XL' }
            ]
        },
        {
            id: 'brand',
            name: 'Brand',
            options: [
                { id: 'zara', name: 'Zara', count: 125 },
                { id: 'hm', name: 'H&M', count: 98 },
                { id: 'shein', name: 'SHEIN', count: 156 },
                { id: 'oxford', name: 'Oxford', count: 87 }
            ]
        }
    ];

    const colors: ColorOption[] = [
        { id: 'white', name: 'White', hex: '#FFFFFF' },
        { id: 'black', name: 'Black', hex: '#000000' },
        { id: 'gray', name: 'Gray', hex: '#808080' },
        { id: 'beige', name: 'Beige', hex: '#F5F5DC' },
        { id: 'blue', name: 'Blue', hex: '#0000FF' },
        { id: 'red', name: 'Red', hex: '#FF0000' },
    ];

    // Type guard para verificar si una opción tiene 'count'
    const hasCount = (option: FilterOption): option is FilterOption & { count: number } => {
        return 'count' in option;
    };

    return (
        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="space-y-6">
                {/* Price Range Inputs */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                    <button
                        className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-900 dark:text-gray-100"
                        onClick={() => toggleCategory('price')}
                    >
                        <span>Price Range</span>
                        {expandedCategories.has('price') ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {expandedCategories.has('price') && (
                        <div className="mt-4 space-y-4">
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                                <input
                                    type="number"
                                    value={priceRange.min}
                                    onChange={(e) => handlePriceChange(e, 'min')}
                                    placeholder="Min"
                                    className="w-full p-2 text-sm border border-gray-200 dark:border-gray-700 rounded"
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                                <input
                                    type="number"
                                    value={priceRange.max}
                                    onChange={(e) => handlePriceChange(e, 'max')}
                                    placeholder="Max"
                                    className="w-full p-2 text-sm border border-gray-200 dark:border-gray-700 rounded"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Color Selection */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                    <button
                        className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-900 dark:text-gray-100"
                        onClick={() => toggleCategory('color')}
                    >
                        <span>Color</span>
                        {expandedCategories.has('color') ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {expandedCategories.has('color') && (
                        <div className="mt-4 grid grid-cols-4 gap-2">
                            {colors.map((color) => (
                                <button
                                    key={color.id}
                                    onClick={() => onColorSelect(color.id)}
                                    className={`w-8 h-8 rounded-full border-2 ${selectedFilters.has(color.id) ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}
                                    style={{ backgroundColor: color.hex }}
                                    title={color.name}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Other Categories */}
                {categories.map((category) => (
                    <div key={category.id} className="border-b border-gray-200 dark:border-gray-700 pb-6">
                        <button
                            className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-900 dark:text-gray-100"
                            onClick={() => toggleCategory(category.id)}
                        >
                            <span>{category.name}</span>
                            {expandedCategories.has(category.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {expandedCategories.has(category.id) && (
                            <div className="mt-4 space-y-4">
                                {category.options.map((option) => (
                                    <div key={option.id} className="flex items-center">
                                        <input
                                            id={`filter-${category.id}-${option.id}`}
                                            name={`${category.id}[]`}
                                            type="checkbox"
                                            checked={selectedFilters.has(option.id)}
                                            onChange={(e) => onFilterChange(category.id, option.id, e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label
                                            htmlFor={`filter-${category.id}-${option.id}`}
                                            className="ml-3 text-sm text-gray-600 dark:text-gray-400 flex justify-between w-full"
                                        >
                                            <span>{option.name}</span>
                                            {hasCount(option) && <span className="text-gray-400">({option.count})</span>}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

