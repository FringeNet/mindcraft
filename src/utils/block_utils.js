// Block categories for smarter resource gathering
export const blockCategories = {
    wood: [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
        'mangrove_log',
        'cherry_log',
        'oak_wood',
        'birch_wood',
        'spruce_wood',
        'jungle_wood',
        'acacia_wood',
        'dark_oak_wood',
        'mangrove_wood',
        'cherry_wood'
    ],
    planks: [
        'oak_planks',
        'birch_planks',
        'spruce_planks',
        'jungle_planks',
        'acacia_planks',
        'dark_oak_planks',
        'mangrove_planks',
        'cherry_planks'
    ],
    leaves: [
        'oak_leaves',
        'birch_leaves',
        'spruce_leaves',
        'jungle_leaves',
        'acacia_leaves',
        'dark_oak_leaves',
        'mangrove_leaves',
        'cherry_leaves'
    ]
};

// Map specific blocks to their categories
export const blockToCategory = {};
Object.entries(blockCategories).forEach(([category, blocks]) => {
    blocks.forEach(block => {
        blockToCategory[block] = category;
    });
});

export function getBlockCategory(blockName) {
    return blockToCategory[blockName] || null;
}

export function getBlocksInCategory(category) {
    return blockCategories[category] || [];
}

export function isSimilarBlock(block1, block2) {
    const cat1 = getBlockCategory(block1);
    const cat2 = getBlockCategory(block2);
    return cat1 && cat1 === cat2;
}

export function findAlternativeBlock(blockName) {
    const category = getBlockCategory(blockName);
    if (!category) return null;
    
    return blockCategories[category].filter(b => b !== blockName);
}