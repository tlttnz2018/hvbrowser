import React, { memo, useState } from 'react';
import { FlatList, FlatListProps, LayoutChangeEvent, PixelRatio, StyleSheet, useWindowDimensions } from 'react-native';

interface GridProps<T> extends Omit<FlatListProps<T>, 'renderItem'> {
  renderItem: (info: { item: T; index: number; size: number; marginTop: number; marginLeft: number }) => React.ReactElement | null;
  numColumns?: number;
  itemMargin?: number;
}

function Grid<T>({ renderItem, numColumns = 3, itemMargin = StyleSheet.hairlineWidth, ...rest }: GridProps<T>) {
  const { width: windowWidth } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(windowWidth);
  const width = listWidth || windowWidth;

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth && nextWidth !== listWidth) {
      setListWidth(nextWidth);
    }
  };

  const renderGridItem = (info: { item: T; index: number }) => {
    const { index } = info;
    const size = PixelRatio.roundToNearestPixel(
      (width - itemMargin! * (numColumns! - 1)) / numColumns!
    );
    const marginTop = index < numColumns! ? 0 : itemMargin!;
    const marginLeft = index % numColumns! === 0 ? 0 : itemMargin!;
    return renderItem({ ...info, size, marginLeft, marginTop });
  };

  return (
    <FlatList
      {...(rest as FlatListProps<T>)}
      extraData={width}
      numColumns={numColumns}
      onLayout={handleLayout}
      renderItem={renderGridItem}
    />
  );
}

export default memo(Grid) as typeof Grid;
