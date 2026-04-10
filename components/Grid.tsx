import React, { memo } from 'react';
import { Dimensions, FlatList, FlatListProps, PixelRatio, StyleSheet } from 'react-native';

interface GridProps<T> extends Omit<FlatListProps<T>, 'renderItem'> {
  renderItem: (info: { item: T; index: number; size: number; marginTop: number; marginLeft: number }) => React.ReactElement | null;
  numColumns?: number;
  itemMargin?: number;
}

function Grid<T>({ renderItem, numColumns = 3, itemMargin = StyleSheet.hairlineWidth, ...rest }: GridProps<T>) {
  const renderGridItem = (info: { item: T; index: number }) => {
    const { index } = info;
    const { width } = Dimensions.get('window');
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
      numColumns={numColumns}
      renderItem={renderGridItem}
    />
  );
}

export default memo(Grid) as typeof Grid;
