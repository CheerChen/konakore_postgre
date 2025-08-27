# file_sync/utils/url_utils.py


def get_preferred_download_url(raw_data):
    """Intelligent download URL selection logic: decide between JPEG and PNG based on compression ratio and file size"""
    
    # Get basic data
    jpeg_file_size = raw_data.get('jpeg_file_size', 0)
    file_size = raw_data.get('file_size', 0)
    jpeg_url = raw_data.get('jpeg_url')
    file_url = raw_data.get('file_url')
    
    # If no jpeg_file_size, directly use file_url
    if jpeg_file_size == 0:
        url = file_url
        size = file_size
    else:
        # Has jpeg_file_size, perform intelligent decision
        file_jpeg_ratio = file_size / jpeg_file_size if jpeg_file_size > 0 else 1
        original_size_bytes = file_size
        
        # Decision logic
        if file_jpeg_ratio >= 10:
            # Compression ratio over 10:1, indicates photo-like image, JPEG works well
            url = jpeg_url
            size = jpeg_file_size
            space_saving_percent = (1 - jpeg_file_size / file_size) * 100
            print(f"[FileSync] Choose JPEG: High compression ratio ({file_jpeg_ratio:.1f}:1), suitable for photos, saves {space_saving_percent:.1f}% space")
        elif file_jpeg_ratio >= 3:
            # Compression ratio 3-10x, medium compression
            if original_size_bytes > 5 * 1024 * 1024:  # Greater than 5MB
                # Recommend JPEG
                url = jpeg_url
                size = jpeg_file_size
                print(f"[FileSync] Choose JPEG: Large file ({original_size_bytes / (1024*1024):.1f}MB), compression ratio {file_jpeg_ratio:.1f}:1 acceptable")
            else:
                # Recommend PNG
                url = file_url
                size = file_size
                print(f"[FileSync] Choose PNG: Small file, maintain PNG lossless quality")
        else:
            # Compression ratio less than 3:1, JPEG advantage not significant
            url = file_url
            size = file_size
            print(f"[FileSync] Choose PNG: Poor compression effect ({file_jpeg_ratio:.1f}:1), maintain PNG lossless")
    
    # Infer file extension from URL
    if url and (url.lower().endswith('.jpg') or url.lower().endswith('.jpeg')):
        ext = 'jpg'
    elif url and url.lower().endswith('.png'):
        ext = 'png'
    elif url and url.lower().endswith('.gif'):
        ext = 'gif'
    else:
        ext = 'jpg'

    if url:
        return [{
            'url': url,
            'size': size,
            'ext': ext
        }]
    else:
        return []
