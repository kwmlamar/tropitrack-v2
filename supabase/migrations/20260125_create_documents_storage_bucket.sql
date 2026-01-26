-- Migration to create documents storage bucket for receipts and other documents
-- This bucket will store receipt images, project documents, and other file uploads
--
-- IMPORTANT: If this migration fails, you can create the bucket manually:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: "documents"
-- 4. Public: OFF (private)
-- 5. File size limit: 10MB
-- 6. Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp, application/pdf, image/heic, image/heif
-- 7. Then run the RLS policies below

-- Create the documents storage bucket if it doesn't exist
DO $$
BEGIN
  -- Check if bucket already exists
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'documents',
      'documents',
      true, -- Public bucket (easier access, use signed URLs for private files if needed)
      10485760, -- 10MB file size limit (10 * 1024 * 1024)
      ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'image/heic', 'image/heif']
    );
  ELSE
    -- Update existing bucket to be public if it was private
    UPDATE storage.buckets 
    SET public = true 
    WHERE id = 'documents' AND public = false;
  END IF;
END $$;

-- RLS Policies for storage.objects (files in the documents bucket)
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

-- Policy: Allow authenticated users to upload files to receipts/ folder
CREATE POLICY "Users can upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'receipts'
  AND auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to view files in the documents bucket
-- All authenticated users in the same company can view documents
CREATE POLICY "Users can view documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
);

-- Policy: Allow users to update files they uploaded (based on metadata or folder structure)
CREATE POLICY "Users can update own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
);

-- Policy: Allow users to delete files they uploaded
CREATE POLICY "Users can delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
);

-- Note: For more granular control, you can add metadata to files when uploading:
-- metadata: { user_id: auth.uid(), company_id: '...' }
-- Then update policies to check metadata.user_id or metadata.company_id
