USE [QuanLyQuanCafe];
GO

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.products', N'image_url') IS NULL
        ALTER TABLE dbo.products ADD image_url NVARCHAR(1000) NULL;

    IF COL_LENGTH(N'dbo.products', N'description') IS NULL
        ALTER TABLE dbo.products ADD [description] NVARCHAR(1000) NULL;

    IF COL_LENGTH(N'dbo.products', N'is_available') IS NULL
    BEGIN
        ALTER TABLE dbo.products
            ADD is_available BIT NOT NULL
                CONSTRAINT DF_products_is_available DEFAULT (1);

        EXEC sys.sp_executesql N'
            UPDATE dbo.products
            SET is_available = is_active;
        ';
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;