import type { IssueCategoryConfig } from '@/lib/support-settings';

export function parseCategoryMatrixInput(value: string): IssueCategoryConfig[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const categoryOrder: string[] = [];
  const categoryMap = new Map<string, { subOrder: string[]; subcategories: Map<string, string[]> }>();

  for (const line of lines) {
    const segments = line.split('>').map((segment) => segment.trim());
    const [category, subcategory1, subcategory2Raw] = segments;
    if (!category || !subcategory1) {
      throw new Error(`Invalid entry "${line}". Use "Category > Subcategory 1 > Subcategory 2" format.`);
    }

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { subOrder: [], subcategories: new Map() });
      categoryOrder.push(category);
    }
    const categoryEntry = categoryMap.get(category)!;

    if (!categoryEntry.subcategories.has(subcategory1)) {
      categoryEntry.subcategories.set(subcategory1, []);
      categoryEntry.subOrder.push(subcategory1);
    }

    const leafOptions = categoryEntry.subcategories.get(subcategory1)!;
    const subcategory2 = subcategory2Raw && subcategory2Raw !== '-' ? subcategory2Raw : null;
    if (subcategory2 && !leafOptions.includes(subcategory2)) {
      leafOptions.push(subcategory2);
    }
  }

  return categoryOrder.map((category) => {
    const entry = categoryMap.get(category)!;
    return {
      category,
      subcategories: entry.subOrder.map((name) => ({
        name,
        subcategories: entry.subcategories.get(name)!,
      })),
    };
  });
}

export function serializeCategoryOptions(options: IssueCategoryConfig[]): string {
  const lines: string[] = [];
  for (const category of options) {
    if (!category || !category.category) {
      continue;
    }
    if (category.subcategories.length === 0) {
      continue;
    }
    for (const sub of category.subcategories) {
      if (!sub || !sub.name) {
        continue;
      }
      if (sub.subcategories.length === 0) {
        lines.push(`${category.category} > ${sub.name}`);
        continue;
      }
      for (const leaf of sub.subcategories) {
        if (!leaf) {
          continue;
        }
        lines.push(`${category.category} > ${sub.name} > ${leaf}`);
      }
    }
  }
  return lines.join('\n');
}
