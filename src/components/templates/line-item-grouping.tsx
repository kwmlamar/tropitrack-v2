"use client";

/**
 * Line Item Grouping Component
 * Allows drag-and-drop organization of line items into groups
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, GripVertical, Trash2, FolderPlus } from "lucide-react";
import type { EstimateLineItem, InvoiceLineItem, TemplateGroupBy } from "@/types";

interface LineItemWithGroup extends (EstimateLineItem | InvoiceLineItem) {
  group_name?: string;
  group_order?: number;
}

interface LineItemGroupingProps {
  items: LineItemWithGroup[];
  groupBy: TemplateGroupBy;
  onItemsChange: (items: LineItemWithGroup[]) => void;
  onGroupByChange: (groupBy: TemplateGroupBy) => void;
}

interface CustomGroup {
  id: string;
  name: string;
  order: number;
}

export function LineItemGrouping({
  items,
  groupBy,
  onItemsChange,
  onGroupByChange,
}: LineItemGroupingProps) {
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([
    { id: "default", name: "Ungrouped", order: 0 },
  ]);
  const [newGroupName, setNewGroupName] = useState("");

  // Get unique categories from items
  const categories = Array.from(new Set(items.map((item) => item.category)));

  // Get unique phases if phase-based grouping
  const phases = ["Foundation", "Framing", "Rough-In", "Finishing", "Final"];

  const addCustomGroup = () => {
    if (!newGroupName.trim()) return;

    const newGroup: CustomGroup = {
      id: `group-${Date.now()}`,
      name: newGroupName,
      order: customGroups.length,
    };

    setCustomGroups([...customGroups, newGroup]);
    setNewGroupName("");
  };

  const removeCustomGroup = (groupId: string) => {
    if (groupId === "default") return; // Can't remove default group

    // Move items from deleted group to default
    const updatedItems = items.map((item) =>
      item.group_name === groupId ? { ...item, group_name: "default" } : item
    );
    onItemsChange(updatedItems);

    setCustomGroups(customGroups.filter((g) => g.id !== groupId));
  };

  const moveItemToGroup = (itemId: string, groupName: string) => {
    const updatedItems = items.map((item) =>
      item.id === itemId ? { ...item, group_name: groupName } : item
    );
    onItemsChange(updatedItems);
  };

  const getGroupedItems = () => {
    if (groupBy === "none") {
      return { "All Items": items };
    }

    if (groupBy === "category") {
      return categories.reduce((groups, category) => {
        groups[category] = items.filter((item) => item.category === category);
        return groups;
      }, {} as Record<string, LineItemWithGroup[]>);
    }

    if (groupBy === "phase") {
      return phases.reduce((groups, phase) => {
        groups[phase] = items.filter((item) => item.group_name === phase);
        return groups;
      }, {} as Record<string, LineItemWithGroup[]>);
    }

    if (groupBy === "custom") {
      return customGroups.reduce((groups, group) => {
        groups[group.name] = items.filter((item) => item.group_name === group.id);
        return groups;
      }, {} as Record<string, LineItemWithGroup[]>);
    }

    return {};
  };

  const groupedItems = getGroupedItems();

  return (
    <div className="space-y-6">
      {/* Grouping Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Grouping Settings</CardTitle>
          <CardDescription>Choose how to organize line items</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Group By</Label>
            <Select value={groupBy} onValueChange={(value) => onGroupByChange(value as TemplateGroupBy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None - Flat list</SelectItem>
                <SelectItem value="category">Category (Labor, Materials, Equipment)</SelectItem>
                <SelectItem value="phase">Phase (Foundation, Framing, Finishing)</SelectItem>
                <SelectItem value="custom">Custom groups</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Groups Management */}
          {groupBy === "custom" && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-muted-foreground" />
                <Label>Custom Groups</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomGroup();
                    }
                  }}
                />
                <Button type="button" onClick={addCustomGroup}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {customGroups.map((group) => (
                  <Badge key={group.id} variant="outline" className="gap-2">
                    {group.name}
                    {group.id !== "default" && (
                      <button
                        type="button"
                        onClick={() => removeCustomGroup(group.id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grouped Items Display */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items Organization</CardTitle>
          <CardDescription>
            {groupBy === "none"
              ? "Items displayed in a flat list"
              : `Items organized by ${groupBy}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(groupedItems).map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-2">
              <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{groupName}</span>
                  <Badge variant="secondary">{groupItems.length} items</Badge>
                </div>
                {groupBy !== "none" && (
                  <span className="text-sm text-muted-foreground">
                    Subtotal: $
                    {groupItems.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                  </span>
                )}
              </div>

              <div className="space-y-1 pl-6">
                {groupItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.category} • ${item.amount?.toFixed(2) || "0.00"}
                        </div>
                      </div>
                    </div>

                    {groupBy === "custom" && (
                      <Select
                        value={item.group_name || "default"}
                        onValueChange={(value) => moveItemToGroup(item.id, value)}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {customGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {groupBy === "phase" && (
                      <Select
                        value={item.group_name || phases[0]}
                        onValueChange={(value) => moveItemToGroup(item.id, value)}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {phases.map((phase) => (
                            <SelectItem key={phase} value={phase}>
                              {phase}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}

                {groupItems.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No items in this group
                  </div>
                )}
              </div>
            </div>
          ))}

          {Object.keys(groupedItems).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No line items to display</p>
              <p className="text-sm mt-1">Add line items to see them organized here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
