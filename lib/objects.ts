// lib/objects.ts
// The object registry for the admin Records console. Kept out of the route file
// because Next.js route modules may only export request handlers.

// Every object the console can manage. `editable` lists the fields the edit
// popup may write — anything else is display-only and can't be tampered with.
export const OBJECTS: Record<string, { table: string; label: string; order: string; editable: string[]; label_field: string }> = {
  contacts:   { table: "contacts",       label: "Contacts",    order: "created_at.desc", label_field: "name",  editable: ["name", "phone", "email", "instagram_handle", "source", "stage", "notes", "follow_up_date", "employee_id"] },
  orders:     { table: "sales",          label: "Orders",      order: "date.desc",       label_field: "id",    editable: ["order_status", "payment_method", "employee_id", "notes"] },
  items:      { table: "catalog_items",  label: "Price list",  order: "created_at.desc", label_field: "name",  editable: ["name", "category", "price", "compare_at_price", "cost", "unit", "type", "is_active", "description"] },
  expenses:   { table: "expenses",       label: "Expenses",    order: "date.desc",       label_field: "note",  editable: ["note", "category", "amount", "date"] },
  employees:  { table: "employees",      label: "Employees",   order: "created_at.desc", label_field: "name",  editable: ["name", "role", "phone", "email", "status", "monthly_salary", "joining_date"] },
  tasks:      { table: "tasks",          label: "Tasks",       order: "created_at.desc", label_field: "title", editable: ["title", "due_date", "done", "employee_id"] },
  notes:      { table: "emp_notes",      label: "Notes",       order: "updated_at.desc", label_field: "body",  editable: ["body", "employee_id"] },
  activities: { table: "activities",     label: "Activity log", order: "created_at.desc", label_field: "content", editable: [] },
  audit:      { table: "audit_log",      label: "Audit trail", order: "created_at.desc", label_field: "action",  editable: [] },
};

