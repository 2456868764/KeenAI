CREATE VIRTUAL TABLE IF NOT EXISTS `fts_memory_chunks` USING fts5(
	`chunk_id` UNINDEXED,
	`org_id` UNINDEXED,
	`brand_id` UNINDEXED,
	`body`,
	tokenize = 'porter unicode61'
);
