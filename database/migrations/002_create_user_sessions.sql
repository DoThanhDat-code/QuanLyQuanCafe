USE [QuanLyQuanCafe];
GO

IF OBJECT_ID(N'dbo.user_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_sessions (
        session_id UNIQUEIDENTIFIER NOT NULL,
        user_id VARCHAR(10) NOT NULL,
        created_at DATETIME2(3) NOT NULL
            CONSTRAINT DF_user_sessions_created_at DEFAULT SYSUTCDATETIME(),
        expires_at DATETIME2(3) NOT NULL,
        revoked_at DATETIME2(3) NULL,

        CONSTRAINT PK_user_sessions PRIMARY KEY (session_id),
        CONSTRAINT FK_user_sessions_users
            FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
    );

    CREATE INDEX IX_user_sessions_user_id
        ON dbo.user_sessions (user_id);
END;
GO

SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'user_sessions'
ORDER BY ORDINAL_POSITION;