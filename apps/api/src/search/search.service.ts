import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Meilisearch } from "meilisearch";
import { Item } from "@prisma/client";
import { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";

const ITEMS_INDEX = "items";

/**
 * Meilisearch holds only what's needed to find matching item IDs and rank them —
 * it is never treated as a source of truth for item data. A search always resolves
 * the returned IDs back against Postgres before responding, so a stale or missing
 * index entry can never surface stale title/favorite/location data, at worst it
 * just means an item doesn't show up in results yet.
 *
 * Every mutating call on the Meilisearch client returns an EnqueuedTaskPromise: a
 * plain `await` only waits for the task to be *queued*, and a failed task resolves
 * normally rather than rejecting the promise — `await x.waitTask()` genuinely waits
 * for it to finish, but you still have to check `.status` yourself afterwards. Every
 * call in this file does; skipping that check is exactly how this went silently wrong
 * the first time it was written.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see src/types/meilisearch.d.ts
  private readonly client: any;

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    this.client = new Meilisearch({
      host: config.get("MEILI_HOST", { infer: true }),
      apiKey: config.get("MEILI_MASTER_KEY", { infer: true }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndexExists();
      const index = this.client.index(ITEMS_INDEX);
      await this.runTask(
        index.updateFilterableAttributes(["accountId", "locationId", "folderId", "spotId", "type", "isFavorite"]),
        "set filterable attributes",
      );
      await this.runTask(index.updateSearchableAttributes(["title", "body", "ocrText"]), "set searchable attributes");
      await this.runTask(index.updateSortableAttributes(["clientCreatedAt"]), "set sortable attributes");
      await this.reindexAll();
    } catch (err) {
      this.logger.warn(
        `Meilisearch setup failed — search will return no results until this is fixed: ${(err as Error).message}`,
      );
    }
  }

  /** Meilisearch can't infer a primary key on a document with several `*id`-suffixed
   *  fields (id, accountId, locationId, folderId, spotId) — every write failed until
   *  this explicitly pinned it. If the index already exists without one (e.g. from
   *  before this code existed), fix it in place — Meilisearch allows that only while
   *  the index is still empty, which holds here since every prior write had failed. */
  private async ensureIndexExists(): Promise<void> {
    const createTask = await this.client.createIndex(ITEMS_INDEX, { primaryKey: "id" }).waitTask();
    if (createTask.status === "succeeded") return;

    const index = this.client.index(ITEMS_INDEX);
    const info = await index.getRawInfo();
    if (info.primaryKey === "id") return;

    await this.runTask(index.update({ primaryKey: "id" }), "set the index's primary key to 'id'");
  }

  async indexItem(item: Item): Promise<void> {
    try {
      await this.runTask(this.client.index(ITEMS_INDEX).addDocuments([this.toDocument(item)]), `index item ${item.id}`);
    } catch (err) {
      this.logger.warn(`Failed to index item ${item.id}: ${(err as Error).message}`);
    }
  }

  async removeItem(itemId: string): Promise<void> {
    try {
      await this.runTask(this.client.index(ITEMS_INDEX).deleteDocument(itemId), `remove item ${itemId}`);
    } catch (err) {
      this.logger.warn(`Failed to remove item ${itemId} from the index: ${(err as Error).message}`);
    }
  }

  /** Returns matching item IDs in relevance order — callers resolve these against Postgres. */
  async search(accountId: string, query: string, locationId?: string): Promise<string[]> {
    let filter = `accountId = "${accountId}"`;
    if (locationId) filter += ` AND locationId = "${locationId}"`;
    const result = await this.client.index(ITEMS_INDEX).search(query, { filter, limit: 50 });
    return result.hits.map((hit) => hit.id as string);
  }

  /** Safe to run on every boot — addDocuments upserts by id, so this just catches up
   *  the index with anything created while Meilisearch was unreachable (or, once, with
   *  every item that predates search existing at all). */
  private async reindexAll(): Promise<void> {
    const items = await this.prisma.item.findMany();
    if (items.length === 0) return;
    await this.runTask(
      this.client.index(ITEMS_INDEX).addDocuments(items.map((item) => this.toDocument(item))),
      "reindex all items",
    );
    this.logger.log(`Reindexed ${items.length} item(s) into Meilisearch`);
  }

  /** Awaits an EnqueuedTaskPromise to actual completion and throws if the task itself
   *  failed — the promise resolving is not enough, since a failed task resolves too. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async runTask(enqueued: any, description: string): Promise<void> {
    const task = await enqueued.waitTask();
    if (task.status !== "succeeded") {
      throw new Error(`Meilisearch task failed (${description}): ${JSON.stringify(task.error)}`);
    }
  }

  private toDocument(item: Item) {
    return {
      id: item.id,
      accountId: item.accountId,
      title: item.title,
      body: item.body,
      ocrText: item.ocrText,
      type: item.type,
      locationId: item.locationId,
      folderId: item.folderId,
      spotId: item.spotId,
      isFavorite: item.isFavorite,
      stamps: item.stamps,
      clientCreatedAt: item.clientCreatedAt.getTime(),
    };
  }
}
