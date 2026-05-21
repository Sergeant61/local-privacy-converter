<script lang="ts">
  import "../app.css";
  import AppShell from "$lib/components/AppShell.svelte";
  import { setupI18n } from "$lib/i18n";

  setupI18n();

  const { children } = $props<{ children: () => unknown }>();
</script>

<AppShell>
  {@render children()}
</AppShell>
