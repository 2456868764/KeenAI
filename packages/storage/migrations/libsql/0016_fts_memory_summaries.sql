CREATE VIRTUAL TABLE IF NOT EXISTS `fts_memory_summaries` USING fts5(
	`summary_id` UNINDEXED,
	`org_id` UNINDEXED,
	`brand_id` UNINDEXED,
	`scope_key` UNINDEXED,
	`level` UNINDEXED,
	`body`,
	tokenize = 'porter unicode61'
);
