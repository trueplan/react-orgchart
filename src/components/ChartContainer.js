import React, {
    useState,
    useEffect,
    useRef,
    forwardRef,
    useImperativeHandle
} from "react";
import PropTypes from "prop-types";
import {selectNodeService} from "./service";
import JSONDigger from "json-digger";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import ChartNode from "./ChartNode";
import "./ChartContainer.css";

const propTypes = {
    datasource: PropTypes.object.isRequired,
    pan: PropTypes.bool,
    zoom: PropTypes.bool,
    zoomoutLimit: PropTypes.number,
    zoominLimit: PropTypes.number,
    containerClass: PropTypes.string,
    chartClass: PropTypes.string,
    nodeClass: PropTypes.string,
    NodeTemplate: PropTypes.elementType,
    draggable: PropTypes.bool,
    collapsible: PropTypes.bool,
    multipleSelect: PropTypes.bool,
    onClickNode: PropTypes.func,
    onClickChart: PropTypes.func
};

const defaultProps = {
    pan: false,
    zoom: false,
    zoomoutLimit: 0.5,
    zoominLimit: 7,
    containerClass: "",
    chartClass: "",
    nodeClass: "",
    draggable: false,
    collapsible: true,
    multipleSelect: false
};

const ChartContainer = forwardRef(
    (
        {
            datasource,
            pan,
            zoom,
            zoomoutLimit,
            zoominLimit,
            containerClass,
            chartClass,
            nodeClass,
            NodeTemplate,
            draggable,
            collapsible,
            multipleSelect,
            onClickNode,
            onClickChart
        },
        ref
    ) => {
        const container = useRef();
        const chart = useRef();
        const downloadButton = useRef();

        const [startX, setStartX] = useState(0);
        const [startY, setStartY] = useState(0);
        const [transform, setTransform] = useState("");
        const [panning, setPanning] = useState(false);
        const [cursor, setCursor] = useState("default");
        const [exporting, setExporting] = useState(false);
        const [dataURL, setDataURL] = useState("");
        const [download, setDownload] = useState("");

        // todo add description of what this function does
        const attachRel = (data, flags) => {
            data.relationship =
                flags + (data.children && data.children.length > 0 ? 1 : 0);
            if (data.children) {
                data.children.forEach((item) => {
                    attachRel(item, (parseInt(flags.charAt(0)) + 1).toString() + (data.children.length > 1 ? 1 : 0));
                });
            }
            return data;
        };

        const [ds, setDS] = useState(datasource);
        useEffect(() => {
            setDS(datasource);
        }, [datasource]);

        const dsDigger = new JSONDigger(datasource, "id", "children");

        const clickChartHandler = event => {
            if (!event.target.closest(".oc-node")) {
                if (onClickChart) {
                    onClickChart();
                }
                selectNodeService.clearSelectedNodeInfo();
            }
        };

        const panEndHandler = () => {
            setPanning(false);
            setCursor("default");
        };

        const panHandler = e => {
            let newX = 0;
            let newY = 0;
            if (!e.targetTouches) {
                // pand on desktop
                newX = e.pageX - startX;
                newY = e.pageY - startY;
            } else if (e.targetTouches.length === 1) {
                // pan on mobile device
                newX = e.targetTouches[0].pageX - startX;
                newY = e.targetTouches[0].pageY - startY;
            } else if (e.targetTouches.length > 1) {
                return;
            }
            if (transform === "") {
                if (transform.indexOf("3d") === -1) {
                    setTransform("matrix(1,0,0,1," + newX + "," + newY + ")");
                } else {
                    setTransform(
                        "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0," + newX + ", " + newY + ",0,1)"
                    );
                }
            } else {
                let matrix = transform.split(",");
                if (transform.indexOf("3d") === -1) {
                    matrix[4] = newX;
                    matrix[5] = newY + ")";
                } else {
                    matrix[12] = newX;
                    matrix[13] = newY;
                }
                setTransform(matrix.join(","));
            }
        };

        const panStartHandler = e => {
            if (e.target.closest(".oc-node")) {
                setPanning(false);
                return;
            } else {
                setPanning(true);
                setCursor("move");
            }
            let lastX = 0;
            let lastY = 0;
            if (transform !== "") {
                let matrix = transform.split(",");
                if (transform.indexOf("3d") === -1) {
                    lastX = parseInt(matrix[4]);
                    lastY = parseInt(matrix[5]);
                } else {
                    lastX = parseInt(matrix[12]);
                    lastY = parseInt(matrix[13]);
                }
            }
            if (!e.targetTouches) {
                // pand on desktop
                setStartX(e.pageX - lastX);
                setStartY(e.pageY - lastY);
            } else if (e.targetTouches.length === 1) {
                // pan on mobile device
                setStartX(e.targetTouches[0].pageX - lastX);
                setStartY(e.targetTouches[0].pageY - lastY);
            } else if (e.targetTouches.length > 1) {
                return;
            }
        };

        const updateChartScale = newScale => {
            let matrix = [];
            let targetScale = 1;
            if (transform === "") {
                setTransform("matrix(" + newScale + ", 0, 0, " + newScale + ", 0, 0)");
            } else {
                matrix = transform.split(",");
                if (transform.indexOf("3d") === -1) {
                    targetScale = Math.abs(window.parseFloat(matrix[3]) * newScale);
                    if (targetScale > zoomoutLimit && targetScale < zoominLimit) {
                        matrix[0] = "matrix(" + targetScale;
                        matrix[3] = targetScale;
                        setTransform(matrix.join(","));
                    }
                } else {
                    targetScale = Math.abs(window.parseFloat(matrix[5]) * newScale);
                    if (targetScale > zoomoutLimit && targetScale < zoominLimit) {
                        matrix[0] = "matrix3d(" + targetScale;
                        matrix[5] = targetScale;
                        setTransform(matrix.join(","));
                    }
                }
            }
        };

        const zoomHandler = e => {
            let newScale = 1 + (e.deltaY > 0 ? -0.2 : 0.2);
            updateChartScale(newScale);
        };

        const exportPDF = (canvas, exportFilename) => {
            const canvasWidth = Math.floor(canvas.width);
            const canvasHeight = Math.floor(canvas.height);
            const doc =
                canvasWidth > canvasHeight
                    ? new jsPDF({
                        orientation: "landscape",
                        unit: "px",
                        format: [canvasWidth, canvasHeight]
                    })
                    : new jsPDF({
                        orientation: "portrait",
                        unit: "px",
                        format: [canvasHeight, canvasWidth]
                    });
            doc.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", 0, 0);
            doc.save(exportFilename + ".pdf");
        };

        const exportPNG = (canvas, exportFilename) => {
            const isWebkit = "WebkitAppearance" in document.documentElement.style;
            const isFf = !!window.sidebar;
            const isEdge =
                navigator.appName === "Microsoft Internet Explorer" ||
                (navigator.appName === "Netscape" &&
                    navigator.appVersion.indexOf("Edge") > -1);

            if ((!isWebkit && !isFf) || isEdge) {
                window.navigator.msSaveBlob(canvas.msToBlob(), exportFilename + ".png");
            } else {
                setDataURL(canvas.toDataURL());
                setDownload(exportFilename + ".png");
                downloadButton.current.click();
            }
        };

        const changeHierarchy = async (draggedItemData, dropTargetId) => {
            await dsDigger.removeNode(draggedItemData.id);
            await dsDigger.addChildren(dropTargetId, draggedItemData);
            setDS({...dsDigger.ds});
        };

        /*
        * Returns the values of the transform string given, only work with 2D chart.
        * @param {string} - The transform string with the following format "matrix(1,1,1,1,1,1)".
        * @returns {array | null} Returns an array with the values or null if the format is not correct
        * */
        const getTransformValues = (transformString) => {
            if (transformString.includes("matrix(")) {
                return transformString
                    .replace(" ", "")
                    .replace("matrix(", "")
                    .replace(")", "")
                    .split(",");
            }
            return null;
        };

        /*
        * Recenter the chart on the X and Y axis. Only works for 2D charts.
        * The transform expected format is "matrix(1,1,1,1,1,1)"
        * */
        const reCenter = () => {
            const transformValues = getTransformValues(transform);
            // only works for 3d charts
            if (transformValues && transformValues.length === 6) {
                const transformCenter = `matrix(${transformValues[0]}, ${transformValues[1]}, ${transformValues[2]}, 
          ${transformValues[3]}, 0, 0)`;
                setTransform(transformCenter)
            }
        };

        /*
        * Rescale the horizontal and vertical scale of the chart. Only works for 2D charts.
        * The transform expected format is "matrix(1,1,1,1,1,1)"
        * */
        const reScale = () => {
            const transformValues = getTransformValues(transform);
            // only works for 2D charts
            if (transformValues && transformValues.length === 6) {
                const transformReScale = `matrix(1, ${transformValues[1]}, ${transformValues[2]}, 1, ${transformValues[4]}, 
          ${transformValues[5]})`;
                setTransform(transformReScale)
            }
        };

        /*
        * Recenter and rescale the chart. Only works for 2D charts.
        * Important: If you wanna recenter and rescale the chart at the same time AVOID using the 'reCenter' and the
        * 'reScale' functions together because some changes might have NO effect. Instead use this function.
        * The transform expected format is "matrix(1,1,1,1,1,1)"
        * */
        const reCenterAndReScale = () => {
            const transformValues = getTransformValues(transform);
            // only works for 2D charts
            if (transformValues && transformValues.length === 6) {
                const transformReScale = `matrix(1, ${transformValues[1]}, ${transformValues[2]}, 1, 0, 0)`;
                setTransform(transformReScale)
            }
        };

        const handleCollapseExpandChildren = (element) => {
            console.log(element)
        }

        useImperativeHandle(ref, () => ({
            exportTo: (exportFilename, exportFileextension) => {
                exportFilename = exportFilename || "OrgChart";
                exportFileextension = exportFileextension || "png";
                setExporting(true);
                const originalScrollLeft = container.current.scrollLeft;
                container.current.scrollLeft = 0;
                const originalScrollTop = container.current.scrollTop;
                container.current.scrollTop = 0;
                html2canvas(chart.current, {
                    width: chart.current.clientWidth,
                    height: chart.current.clientHeight,
                    onclone: function (clonedDoc) {
                        clonedDoc.querySelector(".orgchart").style.background = "none";
                        clonedDoc.querySelector(".orgchart").style.transform = "";
                    }
                }).then(
                    canvas => {
                        if (exportFileextension.toLowerCase() === "pdf") {
                            exportPDF(canvas, exportFilename);
                        } else {
                            exportPNG(canvas, exportFilename);
                        }
                        setExporting(false);
                        container.current.scrollLeft = originalScrollLeft;
                        container.current.scrollTop = originalScrollTop;
                    },
                    () => {
                        setExporting(false);
                        container.current.scrollLeft = originalScrollLeft;
                        container.current.scrollTop = originalScrollTop;
                    }
                );
            },
            expandAllNodes: () => {
                chart.current
                    .querySelectorAll(
                        ".oc-node.hidden, .oc-hierarchy.hidden, .isSiblingsCollapsed, .isAncestorsCollapsed"
                    )
                    .forEach(el => {
                        el.classList.remove(
                            "hidden",
                            "isSiblingsCollapsed",
                            "isAncestorsCollapsed"
                        );
                    });
            },
            reCenter: () => reCenter(),
            reScale: () => reScale(),
            reCenterAndReScale: () => reCenterAndReScale()
        }));

        return (
            <div
                ref={container}
                className={"orgchart-container " + containerClass}
                onWheel={zoom ? zoomHandler : undefined}
                onMouseDown={pan ? panStartHandler : undefined}
                onMouseUp={pan && panning ? panEndHandler : undefined}
                onMouseMove={pan && panning ? panHandler : undefined}
                style={{cursor: cursor}}
            >
                <div
                    ref={chart}
                    className={"orgchart " + chartClass}
                    style={{transform: transform, cursor: cursor}}
                    onClick={clickChartHandler}
                >
                    <ul>
                        <ChartNode
                            className={"oc-node " + nodeClass + "my-ceo"}
                            datasource={attachRel(ds, "00")}
                            NodeTemplate={NodeTemplate}
                            draggable={draggable}
                            collapsible={collapsible}
                            multipleSelect={multipleSelect}
                            changeHierarchy={changeHierarchy}
                            onClickNode={onClickNode}
                        />
                    </ul>
                </div>
                <a
                    className="oc-download-btn hidden"
                    ref={downloadButton}
                    href={dataURL}
                    download={download}
                >
                    &nbsp;
                </a>
                <div className={`oc-mask ${exporting ? "" : "hidden"}`}>
                    <i className="oci oci-spinner spinner"></i>
                </div>
            </div>
        );
    }
);

ChartContainer.propTypes = propTypes;
ChartContainer.defaultProps = defaultProps;

export default ChartContainer;
