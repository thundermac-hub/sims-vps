-- MySQL schema for SIMS Merchant Support (MySQL + MinIO stack)

-- Helpers to create indexes only when missing (MySQL lacks CREATE INDEX IF NOT EXISTS)
DELIMITER //
DROP PROCEDURE IF EXISTS create_index_if_missing//
CREATE PROCEDURE create_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN col_list TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = tbl
      AND index_name = idx
  ) THEN
    SET @stmt = CONCAT('CREATE INDEX ', idx, ' ON ', tbl, ' (', col_list, ')');
    PREPARE s FROM @stmt;
    EXECUTE s;
    DEALLOCATE PREPARE s;
  END IF;
END//

DROP PROCEDURE IF EXISTS create_unique_index_if_missing//
CREATE PROCEDURE create_unique_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN col_list TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = tbl
      AND index_name = idx
  ) THEN
    SET @stmt = CONCAT('CREATE UNIQUE INDEX ', idx, ' ON ', tbl, ' (', col_list, ')');
    PREPARE s FROM @stmt;
    EXECUTE s;
    DEALLOCATE PREPARE s;
  END IF;
END//
DELIMITER ;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  department VARCHAR(255),
  role VARCHAR(255),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS support_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_name VARCHAR(255) NOT NULL,
  outlet_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  email VARCHAR(255),
  fid VARCHAR(4) NOT NULL,
  oid VARCHAR(2) NOT NULL,
  issue_type VARCHAR(255) NOT NULL,
  issue_subcategory1 VARCHAR(255),
  issue_subcategory2 VARCHAR(255),
  issue_description TEXT NOT NULL,
  ticket_description TEXT,
  clickup_link VARCHAR(512),
  clickup_task_id VARCHAR(255),
  clickup_task_status VARCHAR(255),
  clickup_task_status_synced_at DATETIME(3),
  attachment_url VARCHAR(512),
  attachment_url_2 VARCHAR(512),
  attachment_url_3 VARCHAR(512),
  status ENUM('Open', 'In Progress', 'Pending Customer', 'Resolved') NOT NULL DEFAULT 'Open',
  closed_at DATETIME(3),
  updated_by VARCHAR(255),
  ms_pic_user_id BIGINT,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  franchise_name_resolved VARCHAR(255),
  outlet_name_resolved VARCHAR(255),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CALL create_index_if_missing('support_requests', 'support_requests_status_created_idx', 'status, created_at DESC');

CREATE TABLE IF NOT EXISTS support_request_history (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  changed_by VARCHAR(255),
  CONSTRAINT fk_support_request_history_request_id
    FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE
);

CALL create_index_if_missing('support_request_history', 'support_request_history_request_idx', 'request_id, changed_at DESC');

CREATE TABLE IF NOT EXISTS support_form_settings (
  id INT NOT NULL PRIMARY KEY,
  contact_phone VARCHAR(64),
  contact_email VARCHAR(255),
  issue_types JSON NOT NULL,
  category_config JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(255)
);

INSERT INTO support_form_settings (id, issue_types, category_config)
VALUES (
  1,
  JSON_ARRAY(
    'POS - Hardware',
    'POS - Software',
    'Payment Failure',
    'Settlement / Payout',
    'Menu Update',
    'Account & Billing',
    'Others'
  ),
  JSON_ARRAY()
)
ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS csat_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_csat_tokens_request_id
    FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE
);

CALL create_index_if_missing('csat_tokens', 'csat_tokens_request_idx', 'request_id');

CREATE TABLE IF NOT EXISTS csat_responses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT NOT NULL,
  token_id BIGINT,
  support_score VARCHAR(32) NOT NULL,
  support_reason TEXT,
  product_score VARCHAR(32) NOT NULL,
  product_feedback TEXT,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_csat_responses_request_id
    FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_csat_responses_token_id
    FOREIGN KEY (token_id) REFERENCES csat_tokens(id) ON DELETE SET NULL
);

CALL create_unique_index_if_missing('csat_responses', 'csat_responses_token_id_idx', 'token_id');

DROP PROCEDURE IF EXISTS create_index_if_missing;
DROP PROCEDURE IF EXISTS create_unique_index_if_missing;
