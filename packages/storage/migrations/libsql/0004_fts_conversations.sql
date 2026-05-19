CREATE VIRTUAL TABLE IF NOT EXISTS `fts_conversations` USING fts5(
	`conversation_id` UNINDEXED,
	`org_id` UNINDEXED,
	`brand_id` UNINDEXED,
	`subject`,
	`body`,
	tokenize = 'porter unicode61'
);
