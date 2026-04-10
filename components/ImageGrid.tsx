import React, { memo } from 'react';
import { Image, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Grid from './Grid';

interface SiteItem {
  uri?: ReturnType<typeof require>;
  url: string;
  desc: string;
}

interface ImageGridProps {
  onPressImage: (url: string) => void;
  bookmarkStore: SiteItem[];
  lastViewUrl: string;
}

const SITES: SiteItem[] = [
  { uri: require('../assets/uukanshu.gif'), url: 'http://sj.uukanshu.com', desc: 'UU Khán Thư' },
  { uri: require('../assets/66wx.gif'), url: 'http://m.66wx.com', desc: '66 Văn Học' },
  { uri: require('../assets/ranwen.gif'), url: 'http://m.ranwena.com/', desc: 'Nhiên Văn' },
  { uri: require('../assets/17k.png'), url: 'http://h5.17k.com/', desc: '17k' },
  { uri: require('../assets/jiujiu.png'), url: 'http://m.jjxsw.com/', desc: 'Txt99' },
  { uri: require('../assets/80txt.png'), url: 'http://m.80txt.com/', desc: '80txt' },
  { uri: require('../assets/tangiang.png'), url: 'http://wap.jjwxc.net/', desc: 'Tấn Giang' },
  { uri: require('../assets/kanunu8.png'), url: 'http://www.kanunu8.com/', desc: 'Nỗ nỗ' },
];

function ImageGrid({ onPressImage, bookmarkStore, lastViewUrl }: ImageGridProps) {
  const data: SiteItem[] = [
    { url: lastViewUrl, desc: 'Last Open URL' },
    ...SITES,
    ...bookmarkStore,
  ];

  const renderItem = ({
    item,
    size,
    marginTop,
    marginLeft,
  }: {
    item: SiteItem;
    size: number;
    marginTop: number;
    marginLeft: number;
  }) => {
    const style = {
      width: size,
      height: size,
      marginLeft,
      marginTop,
      borderWidth: 1,
      borderColor: '#666',
      borderRadius: 5,
      padding: 5,
    };

    return (
      <TouchableOpacity
        key={item.url || item.desc}
        activeOpacity={0.75}
        onPress={() => onPressImage(item.url)}
        style={style}
      >
        {!!item.uri && <Image source={item.uri} style={styles.image} />}
        {!!item.desc && <Text>{item.desc}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Grid
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => item.url || item.desc}
    />
  );
}

const styles = StyleSheet.create({
  image: { flex: 1 },
});

export default memo(ImageGrid);
