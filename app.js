document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const fileInfo = document.getElementById('file-info');
    const processingStatus = document.getElementById('processing-status');
    const errorMessage = document.getElementById('error-message');
    const cleanedImagesContainer = document.getElementById('cleanedImagesContainer');
    const downloadAllButton = document.getElementById('downloadAllButton');

    let cleanedFiles = []; // To store blobs for "Download All"

    imageUpload.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length) {
            fileInfo.textContent = 'No files selected.';
            return;
        }

        fileInfo.textContent = `${files.length} file(s) selected.`;
        processingStatus.style.display = 'block';
        errorMessage.style.display = 'none';
        cleanedImagesContainer.innerHTML = ''; // Clear previous results
        cleanedFiles = [];
        downloadAllButton.style.display = 'none';

        let successfulProcessing = 0;

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                showError(`File "${file.name}" is not a recognized image type. Skipping.`);
                continue;
            }

            try {
                const cleanedBlob = await stripMetadata(file);
                displayCleanedImage(cleanedBlob, file.name, file.type);
                cleanedFiles.push({ blob: cleanedBlob, name: `cleaned_${file.name}` });
                successfulProcessing++;
            } catch (error) {
                console.error('Error processing file:', file.name, error);
                showError(`Error processing ${file.name}: ${error.message}`);
            }
        }

        processingStatus.style.display = 'none';
        if (successfulProcessing > 0) {
            fileInfo.textContent = `Processed ${successfulProcessing} image(s).`;
            if (cleanedFiles.length > 1) {
                downloadAllButton.style.display = 'block';
            }
        } else if (files.length > 0) {
            fileInfo.textContent = 'No images were processed successfully.';
        }
    });

    function stripMetadata(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    // Determine output type, preserve PNG transparency if possible
                    let outputMimeType = file.type;
                    if (file.type === 'image/jpeg') {
                        outputMimeType = 'image/jpeg'; // Default for JPEG
                    } else if (file.type === 'image/png') {
                        outputMimeType = 'image/png'; // Preserve PNG
                    } else {
                        // For other types like webp, bmp, let browser decide best or default to png
                        outputMimeType = 'image/png';
                        console.warn(`Unsupported type ${file.type} for direct conversion, outputting as PNG.`)
                    }

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas toBlob failed. Image might be too large or tainted.'));
                        }
                    }, outputMimeType, 0.92); // 0.92 quality for JPEGs
                };
                img.onerror = () => {
                    reject(new Error('Could not load image. It might be corrupted or an unsupported format.'));
                };
                img.src = e.target.result; // This is a data URL
            };
            reader.onerror = () => {
                reject(new Error('Could not read file.'));
            };
            reader.readAsDataURL(file);
        });
    }

    function displayCleanedImage(blob, originalName, mimeType) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'cleaned-image-item';

        const previewImg = document.createElement('img');
        previewImg.src = URL.createObjectURL(blob);
        previewImg.alt = `Cleaned ${originalName}`;
        previewImg.onload = () => URL.revokeObjectURL(previewImg.src); // Free memory

        const fileNameP = document.createElement('p');
        const cleanedName = `cleaned_${originalName}`;
        fileNameP.textContent = cleanedName;

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob); // Create a new URL for download link
        downloadLink.download = cleanedName;
        downloadLink.textContent = 'Download';
        downloadLink.className = 'download-link';

        itemDiv.appendChild(previewImg);
        itemDiv.appendChild(fileNameP);
        itemDiv.appendChild(downloadLink);
        cleanedImagesContainer.appendChild(itemDiv);

        // If only one file, make its download link prominent or auto-download
        if (imageUpload.files.length === 1 && cleanedFiles.length === 1) {
            // Optionally, trigger download directly: downloadLink.click();
        }
    }

    downloadAllButton.addEventListener('click', async () => {
        if (cleanedFiles.length === 0) return;

        processingStatus.textContent = 'Zipping files...';
        processingStatus.style.display = 'block';

        const zip = new JSZip();
        for (const file of cleanedFiles) {
            zip.file(file.name, file.blob);
        }

        try {
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: "DEFLATE", compressionOptions: {level: 6} });
            saveAs(zipBlob, 'cleaned_images.zip'); // FileSaver.js function
            processingStatus.textContent = 'Zip downloaded!';
            setTimeout(() => processingStatus.style.display = 'none', 2000);
        } catch (error) {
            console.error("Error zipping files:", error);
            showError("Error creating ZIP file: " + error.message);
            processingStatus.style.display = 'none';
        }
    });


    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        // Auto-hide error after some time
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }
});