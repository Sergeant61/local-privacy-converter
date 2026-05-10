import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    paths: {
      relative: true
    },
    router: {
      type: "hash"
    },
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
      strict: false
    })
  }
};

export default config;
