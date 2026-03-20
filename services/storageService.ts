import { ref, uploadString, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, auth } from "../firebase";

export const storageService = {
  /**
   * Compresses a base64 image string.
   */
  async compressImage(base64Data: string, maxWidth = 512, quality = 0.7): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = base64Data;
    });
  },

  /**
   * Uploads a base64 image string to Firebase Storage and returns the download URL.
   * @param base64Data The base64 string (with or without data:image/png;base64, prefix)
   * @param path The path in storage (e.g., 'stories/user123/chapter1.png')
   * @param compress Whether to compress the image before uploading
   */
  async uploadBase64Image(base64Data: string, path: string, compress = true): Promise<string | null> {
    if (!auth.currentUser) return null;

    try {
      let finalData = base64Data;
      if (compress) {
        finalData = await this.compressImage(base64Data);
      }

      const storageRef = ref(storage, path);
      
      // Remove prefix if present
      const base64Content = finalData.includes(',') 
        ? finalData.split(',')[1] 
        : finalData;

      const contentType = finalData.includes('image/jpeg') ? 'image/jpeg' : 'image/png';

      await uploadString(storageRef, base64Content, 'base64', {
        contentType: contentType,
      });

      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading image to Storage:", error);
      return null;
    }
  },

  async uploadVideoFromUrl(remoteUrl: string, path: string): Promise<string | null> {
    if (!auth.currentUser) return null;

    try {
      const response = await fetch(remoteUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const blob = await response.blob();

      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: 'video/mp4' });

      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading video to Storage:", error);
      return null;
    }
  }
};
