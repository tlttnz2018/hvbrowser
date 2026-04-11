# UI Patterns

## Search Inputs

- Any searchable list or picker should provide an in-field clear affordance when the query is non-empty.
- Default pattern in this repo:
  - keep the `TextInput` as the primary field
  - add right padding so a clear button can sit inside the field area
  - render a small inline clear button with `xmark`
  - hide that clear button when the query is empty
  - use accessibility label `Clear search`
- Reference implementations:
  - [`components/LibraryView.tsx`](/Users/saigon/dev/hvbrowser/components/LibraryView.tsx)
  - [`components/OfflineChapterPicker.tsx`](/Users/saigon/dev/hvbrowser/components/OfflineChapterPicker.tsx)

- Use this pattern by default for:
  - library searches
  - offline chapter pickers
  - full-screen chapter browsers
  - any future filterable modal or drawer list
