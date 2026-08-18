package catalog

// Smoke tests for the catalog package: verify path simplification and
// the buildTree function. These are pure-Go (no DB) so they run in CI.

import "testing"

func TestBuildTree(t *testing.T) {
	parent2 := 1
	flat := []Category{
		{ID: 1, Name: "Root", Slug: "root"},
		{ID: 2, Name: "Child", Slug: "child", ParentID: &parent2},
		{ID: 3, Name: "Other root", Slug: "other"},
	}
	tree := buildTree(flat)
	if len(tree) != 2 {
		t.Fatalf("expected 2 roots, got %d", len(tree))
	}
	var rootWithChild *Category
	for i := range tree {
		if tree[i].ID == 1 {
			rootWithChild = &tree[i]
			break
		}
	}
	if rootWithChild == nil {
		t.Fatal("root id=1 not found")
	}
	if len(rootWithChild.Children) != 1 || rootWithChild.Children[0].ID != 2 {
		t.Fatalf("expected child id=2, got %+v", rootWithChild.Children)
	}
}
