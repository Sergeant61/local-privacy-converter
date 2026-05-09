<script lang="ts">
  import "../app.css";
  import AppShell from "$lib/components/AppShell.svelte";

  const { children } = $props<{ children: () => unknown }>();
</script>

<AppShell>
  {@render children()}
</AppShell>
