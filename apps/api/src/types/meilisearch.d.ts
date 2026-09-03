// The installed `meilisearch` package version ships types only reachable via its modern
// "exports" map, which this project's classic (non-"bundler"/"node16") moduleResolution
// can't see — Node itself resolves the package fine at runtime regardless. Rather than
// change moduleResolution project-wide for one dependency, this untyped ambient
// declaration just tells tsc the module exists; search.service.ts uses it narrowly enough
// that losing type-checking on this one import isn't a meaningful risk.
declare module "meilisearch";
