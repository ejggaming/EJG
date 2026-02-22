import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary and return the secure URL.
 * @param buffer  - File buffer from multer memoryStorage
 * @param folder  - Cloudinary folder path (e.g. "kyc/documents")
 */
export function uploadBuffer(buffer: Buffer, folder: string): Promise<string> {
	return new Promise((resolve, reject) => {
		cloudinary.uploader
			.upload_stream({ folder, resource_type: "image" }, (error, result) => {
				if (error || !result) {
					reject(error ?? new Error("Cloudinary upload returned no result"));
				} else {
					resolve(result.secure_url);
				}
			})
			.end(buffer);
	});
}
