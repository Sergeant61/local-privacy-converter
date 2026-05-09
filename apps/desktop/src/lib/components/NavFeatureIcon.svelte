<script lang="ts">
  type IconId = "convert" | "aspect" | "resolution" | "audioMerge" | "videoMerge" | "frames";

  type Props = {
    id: IconId;
  };

  let { id }: Props = $props();
</script>

<!-- Heroicons tarzı outline; currentColor ile tema uyumu -->
<svg
  class="nav-feature-icon"
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width="1.5"
  stroke="currentColor"
  aria-hidden="true"
>
  {#if id === "convert"}
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7m0 0L21.75 12M4.031 9.865l-3.182 3.182"
    />
  {:else if id === "aspect"}
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
    />
  {:else if id === "resolution"}
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M6 20.25h12M9 20.25v-4.875a.375.375 0 01.375-.375H14.25a.375.375 0 01.375.375V20.25M3.375 17.25h17.25M4.5 17.25V6.75a1.5 1.5 0 011.5-1.5h12a1.5 1.5 0 011.5 1.5v10.5"
    />
  {:else if id === "audioMerge"}
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l-4.372 3.03a.75.75 0 00-.377.648v7.254a.75.75 0 00.377.648l4.372 3.03a.75.75 0 00.753 0l4.372-3.03a.75.75 0 00.377-.648V12.303a.75.75 0 00-.377-.648l-4.372-3.03a.75.75 0 00-.753 0L6.75 8.25zm6.75 3a.75.75 0 00-1.5 0v8.25a.75.75 0 001.5 0v-8.25z"
    />
  {:else if id === "videoMerge"}
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m15.75 10.5 4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
    />
  {:else if id === "frames"}
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h2.25m-2.25 3h2.25m-2.25 3h2.25m3.75 1.5V18"
    />
  {/if}
</svg>

<style>
  .nav-feature-icon {
    width: 1.35rem;
    height: 1.35rem;
    flex-shrink: 0;
  }
</style>
