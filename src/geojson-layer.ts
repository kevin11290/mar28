import * as React from 'react';
const PropTypes = require('prop-types'); // tslint:disable-line
import * as MapboxGL from 'mapbox-gl';
const isEqual = require('deep-equal'); //tslint:disable-line
import diff from './util/diff';
import { generateID } from './util/uid';
import { Sources, SourceOptionData } from './util/types';

const typeToLayerLUT = {
  fill: 'fill',
  'fill-extrusion': 'fillExtrusion',
  symbol: 'symbol',
  circle: 'circle',
  line: 'line'
};

const eventToHandler = {
  mousemove: 'OnMouseMove',
  mouseenter: 'OnMouseEnter',
  mouseleave: 'OnMouseLeave',
  mousedown: 'OnMouseDown',
  mouseup: 'OnMouseUp',
  click: 'OnClick'
};

export type MouseEvent = (evt: any) => any;

export interface LineProps {
  linePaint?: MapboxGL.LinePaint;
  lineLayout?: MapboxGL.LineLayout;
  lineOnMouseMove?: MouseEvent;
  lineOnMouseEnter?: MouseEvent;
  lineOnMouseLeave?: MouseEvent;
  lineOnMouseDown?: MouseEvent;
  lineOnMouseUp?: MouseEvent;
  lineOnClick?: MouseEvent;
}

export interface CircleProps {
  circlePaint?: MapboxGL.CirclePaint;
  circleLayout?: MapboxGL.CircleLayout;
  circleOnMouseMove?: MouseEvent;
  circleOnMouseEnter?: MouseEvent;
  circleOnMouseLeave?: MouseEvent;
  circleOnMouseDown?: MouseEvent;
  circleOnMouseUp?: MouseEvent;
  circleOnClick?: MouseEvent;
}

export interface SymbolProps {
  symbolLayout?: MapboxGL.SymbolLayout;
  symbolPaint?: MapboxGL.SymbolPaint;
  symbolOnMouseMove?: MouseEvent;
  symbolOnMouseEnter?: MouseEvent;
  symbolOnMouseLeave?: MouseEvent;
  symbolOnMouseDown?: MouseEvent;
  symbolOnMouseUp?: MouseEvent;
  symbolOnClick?: MouseEvent;
}

export interface FillProps {
  fillLayout?: MapboxGL.FillLayout;
  fillPaint?: MapboxGL.FillPaint;
  fillOnMouseMove?: MouseEvent;
  fillOnMouseEnter?: MouseEvent;
  fillOnMouseLeave?: MouseEvent;
  fillOnMouseDown?: MouseEvent;
  fillOnMouseUp?: MouseEvent;
  fillOnClick?: MouseEvent;
}

export interface FillExtrusionProps {
  fillExtrusionLayout?: MapboxGL.FillExtrusionLayout;
  fillExtrusionPaint?: MapboxGL.FillExtrusionPaint;
  fillExtrusionOnMouseMove?: MouseEvent;
  fillExtrusionOnMouseEnter?: MouseEvent;
  fillExtrusionOnMouseLeave?: MouseEvent;
  fillExtrusionOnMouseDown?: MouseEvent;
  fillExtrusionOnMouseUp?: MouseEvent;
  fillExtrusionOnClick?: MouseEvent;
}

export interface Props extends LineProps, CircleProps, SymbolProps, FillProps, FillExtrusionProps {
  id?: string;
  data: SourceOptionData;
  layerOptions?: MapboxGL.Layer;
  sourceOptions?:
    | MapboxGL.VectorSource
    | MapboxGL.RasterSource
    | MapboxGL.GeoJSONSource
    | MapboxGL.GeoJSONSourceRaw;
  before?: string;
}

type Paints =
  | MapboxGL.LinePaint
  | MapboxGL.SymbolPaint
  | MapboxGL.CirclePaint
  | MapboxGL.FillExtrusionPaint;
type Layouts =
  | MapboxGL.FillLayout
  | MapboxGL.LineLayout
  | MapboxGL.CircleLayout
  | MapboxGL.FillExtrusionLayout;

export interface Context {
  map: MapboxGL.Map;
}

export default class GeoJSONLayer extends React.Component<Props, {}> {
  public context: Context;

  public static contextTypes = {
    map: PropTypes.object
  };

  private id: string = this.props.id || `geojson-${generateID()}`;

  private source: Sources = {
    type: 'geojson',
    ...this.props.sourceOptions,
    data: this.props.data
  };

  private layerIds: string[] = [];

  private buildLayerId = (type: string) => {
    return `${this.id}-${type}`;
  };

  private createLayer = (type: string) => {
    // const { id, layerIds } = this;
    const { before, layerOptions } = this.props;
    const { map } = this.context;

    const layerId = this.buildLayerId(type);
    this.layerIds.push(layerId);

    const paint: Paints = this.props[`${typeToLayerLUT[type]}Paint`] || {};

    // default undefined layers to invisible
    const visibility = Object.keys(paint).length ? 'visible' : 'none';
    const layout: Layouts = this.props[`${typeToLayerLUT[type]}Layout`] || {
      visibility
    };

    map.addLayer(
      {
        id: layerId,
        source: this.id,
        type: type as any,
        paint,
        layout,
        ...layerOptions
      },
      before
    );

    this.mapLayerMouseHandlers(type);
  };

  private mapLayerMouseHandlers = (type: string) => {
    const { map } = this.context;

    const layerId = this.buildLayerId(type);

    const events = Object.keys(eventToHandler);

    events.forEach(event => {
      const handler =
        this.props[`${typeToLayerLUT[type]}${eventToHandler[event]}`] || null;

      if (handler) {
        map.on(event, layerId, handler);
      }
    });
  };

  private onStyleDataChange = () => {
    // if the style of the map has been updated and we don't have layer anymore,
    // add it back to the map and force re-rendering to redraw it
    if (!this.context.map.getSource(this.id)) {
      this.initialize();
      this.forceUpdate();
    }
  };

  private initialize() {
    const { map } = this.context;

    map.addSource(this.id, this.source);

    this.createLayer('symbol');
    this.createLayer('line');
    this.createLayer('fill');
    this.createLayer('fill-extrusion');
    this.createLayer('circle');
  }

  public componentWillMount() {
    const { map } = this.context;
    this.initialize();
    map.on('styledata', this.onStyleDataChange);
  }

  public componentWillUnmount() {
    const { map } = this.context;

    if (!map || !map.getStyle()) {
      return;
    }

    map.removeSource(this.id);
    map.off('styledata', this.onStyleDataChange);

    Object.keys(typeToLayerLUT).forEach(type => {
      Object.keys(eventToHandler).forEach(event => {
        const prop = typeToLayerLUT[type] + eventToHandler[event];

        if (this.props[prop]) {
          map.off(event, this.buildLayerId(type), this.props[prop]);
        }
      });
    });

    this.layerIds.forEach(lId => map.removeLayer(lId));
  }

  public componentWillReceiveProps(props: Props) {
    const { data, layerOptions } = this.props;
    const { map } = this.context;

    if (props.data !== data) {
      (map.getSource(this.id) as MapboxGL.GeoJSONSource).setData(props.data);
    }

    const layerFilterChanged =
      props.layerOptions &&
      layerOptions &&
      !isEqual(props.layerOptions.filter, layerOptions.filter);

    Object.keys(typeToLayerLUT).forEach(type => {
      const layerId = this.buildLayerId(type);

      if (props.layerOptions && layerFilterChanged) {
        map.setFilter(layerId, props.layerOptions.filter as any);
      }

      const paintProp = typeToLayerLUT[type] + 'Paint';

      if (!isEqual(props[paintProp], this.props[paintProp])) {
        const paintDiff = diff(this.props[paintProp], props[paintProp]);

        Object.keys(paintDiff).forEach(key => {
          map.setPaintProperty(layerId, key, paintDiff[key]);
        });
      }

      const layoutProp = typeToLayerLUT[type] + 'Layout';

      if (!isEqual(props[layoutProp], this.props[layoutProp])) {
        const layoutDiff = diff(this.props[layoutProp], props[layoutProp]);

        Object.keys(layoutDiff).forEach(key => {
          map.setLayoutProperty(layerId, key, layoutDiff[key]);
        });
      }

      Object.keys(eventToHandler).forEach(event => {
        const prop = typeToLayerLUT[type] + eventToHandler[event];

        if (props[prop] !== this.props[prop]) {
          if (this.props[prop]) {
            map.off(event, layerId, this.props[prop]);
          }

          if (props[prop]) {
            map.on(event, layerId, props[prop]);
          }
        }
      });
    });
  }

  public render() {
    return null;
  }
}
