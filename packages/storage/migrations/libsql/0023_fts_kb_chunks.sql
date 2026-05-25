CREATE VIRTUAL TABLE IF NOT EXISTS `fts_kb_chunks` USING fts5(
	`chunk_id` UNINDEXED,
	`org_id` UNINDEXED,
	`brand_id` UNINDEXED,
	`content`,
	`context_prefix`,
	tokenize = 'porter unicode61'
);
