drop policy if exists "flow_edges_insert" on flow_edges;

create policy "flow_edges_insert" on flow_edges
  for insert with check (
    from_node in (select id from flow_nodes where is_project_member(project_id))
    and to_node in (select id from flow_nodes where is_project_member(project_id))
  );