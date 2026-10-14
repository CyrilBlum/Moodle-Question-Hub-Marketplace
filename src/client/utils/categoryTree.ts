export interface CategoryNode {
  name: string;
  children: CategoryNode[];
}

/** Builds a tree from Moodle category paths such as `$course$/top/Informatik/Bäume`. */
export function buildCategoryTree(paths: string[]): CategoryNode[] {
  const root: CategoryNode = { name: '', children: [] };
  for (const path of paths) {
    const parts = path
      .split('/')
      .map(p => p.trim())
      .filter(p => p && p !== '$course$' && p !== 'top' && !/^\$.*\$$/.test(p));
    let node = root;
    for (const part of parts) {
      let child = node.children.find(c => c.name === part);
      if (!child) {
        child = { name: part, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root.children;
}

export function countNodes(nodes: CategoryNode[]): number {
  return nodes.reduce((n, c) => n + 1 + countNodes(c.children), 0);
}
