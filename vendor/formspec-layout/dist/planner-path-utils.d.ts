/** @filedesc Definition/component path lookup helpers for the layout planner. */
import type { ComponentTreeNode, FormItem } from './types.js';
export declare function componentTreeOwnsPages(tree: ComponentTreeNode | null | undefined): boolean;
export declare function findItemPathByKey(items: FormItem[], key: string, prefix?: string): string | null;
export declare function findItemAtPath(items: FormItem[], path: string): FormItem | null;
export declare function getParentPath(path: string): string;
export declare function findComponentNodeByPath(_items: FormItem[], rootNode: ComponentTreeNode, path: string): ComponentTreeNode | null;
export declare function findNodeByBindPath(node: ComponentTreeNode, targetPath: string, currentPrefix: string): ComponentTreeNode | null;
