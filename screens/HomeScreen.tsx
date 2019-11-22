import React, { FunctionComponent } from 'react';
import styled from 'styled-components';
import ImageGrid from '../components/ImageGrid';

type UpdateUrlFunction = (url: string) => void;

interface HomeProps {
  onPressImage: UpdateUrlFunction;
  bookmarkStore: any; // TODO: Determine bookmarkStore format.
  lastViewUrl: string;
}

const HomeWrapper = styled.View`
  flex: 6
  justify-content: center
`;

const Instruction = styled.Text`
    margin: 10px 10px
`;

export const Home: FunctionComponent<HomeProps> = props => {
  return (
    <HomeWrapper>
      <Instruction>
        Please click on 🏠 button for switching between Home and Browse mode or click on any icon
        below to go to the site.
      </Instruction>
      <ImageGrid
        onPressImage={props.onPressImage}
        bookmarkStore={props.bookmarkStore || []}
        lastViewUrl={props.lastViewUrl}
      />
    </HomeWrapper>
  );
};
