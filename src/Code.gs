/**
 * @OnlyCurrentDoc
 */

// App context handler
const AppContext = {
    DOCS: 'docs',
    SLIDES: 'slides',

    getCurrentContext() {
        try {
            DocumentApp.getUi();
            return this.DOCS;
        } catch {
            try {
                SlidesApp.getUi();
                return this.SLIDES;
            } catch {
                throw new Error('Not running in either Docs or Slides context');
            }
        }
    },

    getUI() {
        return this.getCurrentContext() === this.DOCS ? DocumentApp.getUi() : SlidesApp.getUi();
    }
};

// Menu handlers
function onInstall(e) {
    onOpen(e);
}

function onOpen(e) {
    AppContext.getUI()
        .createAddonMenu()
        .addItem('New chart', 'addNewChart')
        .addItem('Edit selected chart', 'editSelectedChart')
        .addToUi();
}

// Image selection handlers
const ImageSelector = {
    findSelectedImage() {
        return AppContext.getCurrentContext() === AppContext.DOCS
            ? this.findInDocs()
            : this.findInSlides();
    },

    findInDocs() {
        try {
            return DocumentApp.getActiveDocument()
                .getSelection()
                ?.getRangeElements()
                ?.map(element => element.getElement())
                .find(element =>
                    element.getType() === DocumentApp.ElementType.INLINE_IMAGE &&
                    element.asInlineImage().getAltTitle()?.startsWith('mermaid-graph')
                )
                ?.asInlineImage();
        } catch (e) {
            this.handleAuthError();
            throw e;
        }
    },

    findInSlides() {
        try {
            return SlidesApp.getActivePresentation()
                .getSelection()
                ?.getPageElementRange()
                ?.getPageElements()
                ?.find(element =>
                    element.getPageElementType() === SlidesApp.PageElementType.IMAGE &&
                    element.asImage().getTitle()?.startsWith('mermaid-graph')
                )
                ?.asImage();
        } catch (e) {
            this.handleAuthError();
            throw e;
        }
    },

    handleAuthError() {
        AppContext.getUI().alert(
            'Multiple Google accounts issue: Please ensure you are using your default Google account. ' +
            'Try logging out of all accounts and logging back in with your primary account first.'
        );
    }
};

// Chart metadata handlers
const ChartMetadata = {
    getFromImage(image) {
        if (!image) return null;

        const isDocsContext = AppContext.getCurrentContext() === AppContext.DOCS;
        const source = isDocsContext ? image.getAltDescription() : image.getDescription();
        const theme = isDocsContext
            ? image.getAltTitle().replace('mermaid-graph/', '')
            : image.getTitle().replace('mermaid-graph/', '');

        try {
            const decoded = JSON.parse(source);
            return {
                source: decoded.source || source,
                theme: decoded.theme || theme
            };
        } catch {
            return {source, theme};
        }
    }
};

// Dialog handlers
function openDialog(source, label, theme, currentWidth = 0) {
    const html = HtmlService.createHtmlOutputFromFile('index')
        .setWidth(3000)
        .setHeight(2000)
        .append(`<script>
      window.graphDataFromGoogle=${JSON.stringify({source, label, theme, currentWidth})}
    </script>`);

    AppContext.getUI().showModalDialog(html, 'Graph editor');
}

// Main command handlers
function addNewChart() {
    const selected = ImageSelector.findSelectedImage();

    if (selected) {
        AppContext.getUI().alert(
            'You have a chart selected, please unselect it first, or click "edit" to edit it.'
        );
    } else {
        openDialog("graph LR\n  A -->B", 'Insert', "");
    }
}

function editSelectedChart() {
    const selected = ImageSelector.findSelectedImage();

    if (!selected) {
        AppContext.getUI().alert(
            'Please select an existing chart created with this app first.'
        );
        return;
    }

    const metadata = ChartMetadata.getFromImage(selected);
    openDialog(metadata.source, 'Update', metadata.theme, selected.getWidth());
}

// Image insertion handlers
const ImageInserter = {
    insert(source, theme, base64, width, height) {
        return AppContext.getCurrentContext() === AppContext.DOCS
            ? this.insertInDocs(source, theme, base64, width, height)
            : this.insertInSlides(source, theme, base64, width, height);
    },

    createBlob(base64) {
        return Utilities.newBlob(
            Utilities.base64Decode(base64.split(',')[1]),
            'image/png',
            "mermaid-chart.png"
        );
    },

    insertInDocs(source, theme, base64, width, height) {
        const blob = this.createBlob(base64);
        const selected = ImageSelector.findInDocs();
        let posImage = null;

        if (selected) {
            const parent = selected.getParent();
            posImage = parent.insertInlineImage(parent.getChildIndex(selected) + 1, blob);
            selected.removeFromParent();
        } else {
            const cursor = DocumentApp.getActiveDocument().getCursor();
            if (cursor) {
                posImage = cursor.insertInlineImage(blob);
            } else {
                const body = DocumentApp.getActiveDocument().getBody();
                const paragraph = body.appendParagraph('');
                posImage = paragraph.appendInlineImage(blob);
            }
        }

        this.setImageProperties(posImage, source, theme, width, height, true);
        return posImage;
    },

    insertInSlides(source, theme, base64, width, height) {
        const blob = this.createBlob(base64);
        const selected = ImageSelector.findInSlides();
        let posImage = null;

        if (selected) {
            posImage = selected.replace(blob);
        } else {
            posImage = SlidesApp.getActivePresentation().getSelection()
                    ?.getCurrentPage()
                    ?.insertImage(blob)
                || SlidesApp.getActivePresentation().appendSlide()
                    ?.insertImage(blob);
        }

        this.setImageProperties(posImage, source, theme, width, height, false);
        return posImage;
    },

    setImageProperties(image, source, theme, width, height, isDocsContext) {
        if (!image) return;

        if (isDocsContext) {
            image.setAltDescription(source);
            image.setAltTitle('mermaid-graph/' + theme);
        } else {
            image.setDescription(source);
            image.setTitle('mermaid-graph/' + theme);
        }

        image.setWidth(width);
        image.setHeight(height);
    }
};

// Main insertion function
function insertImage(source, theme, base64, width, height) {
    return ImageInserter.insert(source, theme, base64, width, height);
}