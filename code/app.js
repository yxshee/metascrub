document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const imageUpload = document.getElementById('imageUpload');
    const fileSummary = document.getElementById('file-summary');
    const optionsSection = document.getElementById('optionsSection');
    const outputFormatSelect = document.getElementById('outputFormat');
    const jpegQualityGroup = document.getElementById('jpegQualityGroup');
    const jpegQualityInput = document.getElementById('jpegQuality');
    const processingIndicator = document.getElementById('processing-indicator');
    const globalErrorMessage = document.getElementById('global-error-message');
    const resultsSection = document.getElementById('resultsSection');
    const downloadAllButton = document.getElementById('downloadAllButton');
    const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');

    let processedFileObjects = [];

    // --- Theme Toggle ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggleCheckbox.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            themeToggleCheckbox.checked = false;
        }
    }

    themeToggleCheckbox.addEventListener('change', () => {
        if (themeToggleCheckbox.checked) {
            localStorage.setItem('theme', 'dark');
            applyTheme('dark');
        } else {
            localStorage.setItem('theme', 'light');
            applyTheme('light');
        }
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light
    applyTheme(savedTheme);


    // --- Drag & Drop ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });
    dropZone.addEventListener('drop', handleDrop, false);
    imageUpload.addEventListener('change', handleFileSelect);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(Array.from(files)); // Convert FileList to Array
    }

    function handleFileSelect(e) {
        handleFiles(Array.from(e.target.files)); // Convert FileList to Array
    }

    document.addEventListener('paste', async (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        const imageFiles = [];
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                const fileName = file.name || `pasted_image_${Date.now()}.${file.type.split('/')[1] || 'png'}`;
                imageFiles.push(new File([file], fileName, { type: file.type }));
            }
        }
        if (imageFiles.length > 0) {
            fileSummary.textContent = `Pasted ${imageFiles.length} image(s).`;
            await handleFiles(imageFiles);
        } else if (items.length > 0 && !imageFiles.length) {
            showGlobalError("No image data found in clipboard content.");
        }
    });

    async function handleFiles(files) {
        if (!files || files.length === 0) {
            fileSummary.textContent = 'No files selected.';
            return;
        }

        resultsSection.innerHTML = '';
        processedFileObjects = [];
        downloadAllButton.style.display = 'none';
        optionsSection.style.display = 'block';
        globalErrorMessage.style.display = 'none';
        processingIndicator.style.display = 'block';
        
        const imageFiles = files.filter(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
        const nonImageFilesCount = files.length - imageFiles.length;

        fileSummary.textContent = `${imageFiles.length} image(s) selected. ${nonImageFilesCount > 0 ? nonImageFilesCount + ' non-image file(s) ignored.' : ''}`;
        
        if (imageFiles.length === 0) {
            processingIndicator.style.display = 'none';
            showGlobalError("No valid image files were selected.");
            return;
        }
        
        processingIndicator.textContent = `Preparing ${imageFiles.length} image(s)...`;

        let processedCount = 0;
        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            processingIndicator.textContent = `Processing image ${processedCount + 1} of ${imageFiles.length}: ${file.name}`;
            const card = createResultCard(file.name, i);
            resultsSection.appendChild(card);

            try {
                // Pass original file to stripMetadata for preview purposes
                await processSingleFile(file, card);
                processedCount++;
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                updateCardWithError(card, `Failed to process: ${error.message}`);
            }
        }

        processingIndicator.style.display = 'none';
        if (processedFileObjects.length > 0) {
            fileSummary.textContent = `Successfully processed ${processedFileObjects.length} image(s).`;
            if (processedFileObjects.length > 1) {
                downloadAllButton.style.display = 'block';
            } else if (processedFileObjects.length === 1 && resultsSection.querySelector('.download-link-individual')) {
                // If only one file, maybe make its download more prominent or auto-focus
            }
        } else if (imageFiles.length > 0) {
            fileSummary.textContent = 'No images were processed successfully.';
        }
    }
    
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    async function processSingleFile(file, cardElement) {
        const originalSize = file.size;
        // For HEIC/HEIF, file.type might be empty, so check extension too.
        const originalType = file.type || (/\.(heic|heif)$/i.test(file.name) ? (file.name.toLowerCase().endsWith('.heic') ? 'image/heic' : 'image/heif') : 'unknown/unknown');

        let metadata = {};
        let metadataError = null;
        try {
            metadata = await exifr.parse(file, {
                tiff: true, xmp: true, icc: true, iptc: true, jfif: true, ihdr: true,
                quicktime: true, // Important for HEIC/HEIF metadata often in MOV-like container
                multiSegment: true
            });
        } catch (exifError) {
            console.warn(`Could not read metadata for ${file.name}:`, exifError);
            metadataError = `Error reading metadata: ${exifError.message}`;
            metadata = {};
        }
        updateCardOriginalInfo(cardElement, file, originalSize, originalType, metadata, metadataError);

        try {
            const cleanedBlob = await stripMetadata(file, cardElement); // Pass cardElement for HEIC warning
            const targetMimeType = getTargetMimeType(file.type, outputFormatSelect.value);
            const extension = targetMimeType.split('/')[1] || 'bin';
            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            const cleanedFileName = `sanitized_${baseName}.${extension}`;
            
            processedFileObjects.push({ blob: cleanedBlob, name: cleanedFileName });
            updateCardCleanedInfo(cardElement, cleanedBlob, cleanedFileName);
        } catch (stripError) {
            console.error('Error stripping metadata:', stripError);
            updateCardWithError(cardElement, `Sanitization failed: ${stripError.message}`);
            throw stripError; // Re-throw to be caught by handleFiles loop
        }
    }

    function getTargetMimeType(originalMimeType, selectedOutputFormat) {
        if (selectedOutputFormat === 'original') {
            // If original is complex (GIF) or problematic for canvas (HEIC without native support), default to PNG
            if (originalMimeType === 'image/gif' || originalMimeType === 'image/heic' || originalMimeType === 'image/heif') {
                return 'image/png';
            }
            return ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(originalMimeType) ? originalMimeType : 'image/png';
        }
        return selectedOutputFormat;
    }

    function stripMetadata(file, cardElement) { // Added cardElement for HEIC warning
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e_reader) => {
                const img = new Image();
                img.onload = () => {
                    const isHEIC = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);
                    if (isHEIC && (img.naturalWidth === 0 || img.naturalHeight === 0) && cardElement) {
                        const heicWarningP = cardElement.querySelector('.cleaned-info .heic-warning-placeholder');
                        if (heicWarningP) {
                            heicWarningP.innerHTML = `<div class="heic-warning"><strong>HEIC Notice:</strong> Your browser might not support sanitizing this HEIC file correctly (image could be blank). Consider converting to JPEG/PNG first if issues arise.</div>`;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

                    const targetMimeType = getTargetMimeType(file.type, outputFormatSelect.value);
                    let quality = targetMimeType === 'image/jpeg' ? parseFloat(jpegQualityInput.value) : undefined;

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas toBlob conversion failed. Image might be too large, tainted, or format unsupported.'));
                        }
                    }, targetMimeType, quality);
                };
                img.onerror = () => reject(new Error('Failed to load image for canvas processing. It might be corrupted or an unsupported format (e.g., HEIC in some browsers).'));
                img.src = e_reader.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsDataURL(file);
        });
    }


    function createResultCard(fileName, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.id = `card-${index}`;
        card.innerHTML = `
            <div class="result-card-header"><i class="fas fa-image"></i> ${fileName}</div>
            <div class="result-card-body">
                <div class="image-info-column original-info">
                    <h4><i class="fas fa-eye"></i> Original</h4>
                    <img src="" alt="Original Preview" class="image-preview original-preview">
                    <div class="file-details original-details">
                        <p><strong>Size:</strong> <span class="original-size">N/A</span></p>
                        <p><strong>Type:</strong> <span class="original-type">N/A</span></p>
                    </div>
                    <h5>Metadata:</h5>
                    <div class="metadata-display original-metadata">Loading metadata...</div>
                </div>
                <div class="image-info-column cleaned-info">
                    <h4><i class="fas fa-spray-can-sparkles"></i> Sanitized</h4>
                    <img src="" alt="Cleaned Preview" class="image-preview cleaned-preview">
                    <div class="file-details cleaned-details">
                        <p><strong>Size:</strong> <span class="cleaned-size">N/A</span></p>
                        <p><strong>Type:</strong> <span class="cleaned-type">N/A</span></p>
                    </div>
                    <div class="heic-warning-placeholder"></div> <!-- For HEIC specific warnings -->
                    <h5>Metadata:</h5>
                    <div class="metadata-display cleaned-metadata empty">All metadata removed.</div>
                    <a href="#" class="download-link-individual" style="display:none;"><i class="fas fa-download"></i> Download</a>
                </div>
            </div>
            <div class="error-display" style="display:none; padding: 0 15px 15px;"></div>
        `;
        return card;
    }

    function updateCardOriginalInfo(cardElement, file, size, type, metadata, metadataError) {
        // Original preview (load the file into the img tag)
        const reader = new FileReader();
        reader.onload = function(e) {
            cardElement.querySelector('.original-preview').src = e.target.result;
        }
        reader.readAsDataURL(file); // file is the original File object

        cardElement.querySelector('.original-size').textContent = formatBytes(size);
        cardElement.querySelector('.original-type').textContent = type;
        const metadataDiv = cardElement.querySelector('.original-metadata');

        if (metadataError) {
            metadataDiv.textContent = metadataError;
            metadataDiv.classList.add('empty');
        } else if (metadata && Object.keys(metadata).length > 0) {
            let metaString = '';
            const commonFields = {
                Make: metadata.Make, Model: metadata.Model, DateTimeOriginal: metadata.DateTimeOriginal,
                Software: metadata.Software, Artist: metadata.Artist, Copyright: metadata.Copyright,
                ImageDescription: metadata.ImageDescription, UserComment: metadata.UserComment,
                XPTitle: metadata.XPTitle, XPComment: metadata.XPComment, XPAuthor: metadata.XPAuthor, XPSubject: metadata.XPSubject,
                LensModel: metadata.LensModel, ExposureTime: metadata.ExposureTime, FNumber: metadata.FNumber, ISO: metadata.ISO,
                GPSLatitude: metadata.GPSLatitude, GPSLongitude: metadata.GPSLongitude, GPSAltitude: metadata.GPSAltitude,
                Orientation: metadata.Orientation,
                // PNG specific, from ihdr chunk typically
                ImageWidth: metadata.ImageWidth, ImageHeight: metadata.ImageHeight, BitDepth: metadata.BitDepth, ColorType: metadata.ColorType
            };

            for (const key in commonFields) {
                if (commonFields[key] !== undefined && commonFields[key] !== null) {
                     let val = commonFields[key];
                     if (typeof val === 'number' && (key === 'ExposureTime' || key === 'FNumber')) val = val.toString(); // Ensure display
                     else if (typeof val === 'object') val = JSON.stringify(val); // Basic object display
                    metaString += `${key}: ${String(val).substring(0,150)}\n`; // Limit value length
                }
            }

            if (!metaString.trim() && Object.keys(metadata).length > 0) { // If no common fields, show some raw data
                metaString = "Other detected metadata (partial view):\n";
                let count = 0;
                for (const key in metadata) {
                    if (Object.prototype.hasOwnProperty.call(metadata, key) && !commonFields.hasOwnProperty(key)) {
                        const value = metadata[key];
                        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                            metaString += `${key}: ${String(value).substring(0, 100)}\n`;
                            count++;
                        } else if (Array.isArray(value) && value.length > 0 && value.length < 10 && value.every(item => typeof item === 'number' || typeof item === 'string')) {
                            metaString += `${key}: [${value.join(', ').substring(0,100)}]\n`;
                            count++;
                        }
                        if (count >= 10) { metaString += '...\n'; break; }
                    }
                }
                if (count === 0) metaString = "Metadata found, but in a complex or non-standard structure.\n";
            }
            
            metadataDiv.textContent = metaString.trim() || "No common readable metadata tags found.";
            metadataDiv.classList.toggle('empty', !metaString.trim());

        } else {
            metadataDiv.textContent = "No metadata found or file type not fully supported by metadata parser for detailed extraction.";
            metadataDiv.classList.add('empty');
        }
    }

    function updateCardCleanedInfo(cardElement, blob, cleanedFileName) {
        const previewURL = URL.createObjectURL(blob);
        const cleanedPreviewImg = cardElement.querySelector('.cleaned-preview');
        cleanedPreviewImg.src = previewURL;
        cleanedPreviewImg.onload = () => { /* URL.revokeObjectURL(previewURL) might be too soon if download is later */ };
        
        cardElement.querySelector('.cleaned-size').textContent = formatBytes(blob.size);
        cardElement.querySelector('.cleaned-type').textContent = blob.type;

        const downloadLink = cardElement.querySelector('.download-link-individual');
        // Create a new Object URL for download to ensure it's fresh, esp if preview one is revoked.
        downloadLink.href = URL.createObjectURL(blob); 
        downloadLink.download = cleanedFileName;
        downloadLink.style.display = 'block';

        // Optional: Auto-revoke preview URL if you are sure it's not needed
        // setTimeout(() => URL.revokeObjectURL(previewURL), 5000); // Example
    }

    function updateCardWithError(cardElement, message) {
        const errorDisplay = cardElement.querySelector('.error-display');
        errorDisplay.textContent = message;
        errorDisplay.style.display = 'block';
        // Dim the cleaned section or show an error icon
        const cleanedInfoCol = cardElement.querySelector('.cleaned-info');
        if(cleanedInfoCol) cleanedInfoCol.style.opacity = '0.5';
    }

    function showGlobalError(message) {
        globalErrorMessage.textContent = message;
        globalErrorMessage.style.display = 'block';
        setTimeout(() => globalErrorMessage.style.display = 'none', 7000);
    }

    outputFormatSelect.addEventListener('change', () => {
        jpegQualityGroup.style.display = (outputFormatSelect.value === 'image/jpeg' || (outputFormatSelect.value === 'original' /* && some condition for JPEG output */))
            ? 'block' : 'none';
    });
    outputFormatSelect.dispatchEvent(new Event('change'));

    downloadAllButton.addEventListener('click', async () => {
        if (processedFileObjects.length === 0) return;
        processingIndicator.textContent = 'Zipping files...';
        processingIndicator.style.display = 'block';
        const zip = new JSZip();
        for (const fileObj of processedFileObjects) {
            zip.file(fileObj.name, fileObj.blob);
        }
        try {
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: "DEFLATE", compressionOptions: { level: 6 } });
            saveAs(zipBlob, 'MetaPurged_Images.zip');
            processingIndicator.textContent = 'ZIP downloaded!';
            setTimeout(() => processingIndicator.style.display = 'none', 3000);
        } catch (error) {
            console.error("Error zipping files:", error);
            showGlobalError("Error creating ZIP file: " + error.message);
            processingIndicator.style.display = 'none';
        }
    });
});